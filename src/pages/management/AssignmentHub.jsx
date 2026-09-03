// src/pages/management/AssignmentHub.jsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { db } from '../../config/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { DEPARTMENTS, getDeptColor, PROGRAM_DEPARTMENTS } from '../../config/constants';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
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
  ArrowRightLeft
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
      className="form-select"
      style={{ margin: 0, padding: '4px 8px', fontSize: '0.78rem', width: '100%' }}
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
            ✨ {assignedProf.name || `${assignedProf.lastName}, ${assignedProf.firstName}`} ({assignedProf.department})
          </option>
        ) : (
          <option value="">⚠️ Assign Faculty...</option>
        )
      ) : (
        // Expanded state with full categorized options
        <>
          <option value="">⚠️ Assign Faculty...</option>
          {specProfs.length > 0 && (
            <optgroup label="Specialized in this Subject">
              {specProfs.map(p => (
                <option key={p.id} value={p.id}>
                  ✨ {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
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
  activeSemester,
  user,
  onBack
}) => {
  const [viewMode, setViewMode] = useState('sections'); // 'sections' | 'faculty' | 'subjects'
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [quickCreateState, setQuickCreateState] = useState({ isOpen: false, type: 'subject' });

  // Modal state for editing an entity's assignments in-depth
  const [editingEntity, setEditingEntity] = useState(null); // { type: 'section'|'faculty'|'subject', item: obj }
  const [stagedAssignedSubjects, setStagedAssignedSubjects] = useState([]);
  const [stagedAssignedSections, setStagedAssignedSections] = useState([]);
  const [stagedFacultyMap, setStagedFacultyMap] = useState({}); // for section: subjectRef -> profId, for faculty: secId -> [subjectRefs]
  const [isSaving, setIsSaving] = useState(false);

  // --- High-Performance Pre-Indexed Lookups (O(1)) ---
  const subjectLookup = useMemo(() => {
    const map = new Map();
    subjects.forEach(s => {
      if (s.id) map.set(String(s.id).toLowerCase(), s);
      if (s.code) map.set(String(s.code).toLowerCase(), s);
      if (s.name) map.set(String(s.name).toLowerCase(), s);
    });
    return map;
  }, [subjects]);

  const getSubject = useCallback((subRef) => {
    if (!subRef) return null;
    if (typeof subRef === 'object' && subRef !== null) return subRef;
    return subjectLookup.get(String(subRef).toLowerCase()) || null;
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
  const subjectProfOptionsCache = useRef(new Map());

  useEffect(() => {
    subjectProfOptionsCache.current.clear();
  }, [subjects, professors, profsBySubjectKey]);

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
    const otherProfs = professors.filter(p => !seen.has(p.id));
    const result = { specProfs, otherProfs };
    keys.forEach(k => subjectProfOptionsCache.current.set(String(k).toLowerCase(), result));
    subjectProfOptionsCache.current.set(cacheKey, result);
    return result;
  }, [getSubject, profsBySubjectKey, professors]);

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
  const assignedProfCache = useRef(new Map());

  // Invalidate cache whenever base collections change
  useEffect(() => {
    assignedProfCache.current.clear();
  }, [sections, professors, subjects]);

  // Helper to accurately resolve assigned professor for a specific section and subject in O(1)
  const getAssignedProf = useCallback((sec, subRef) => {
    if (!sec || !subRef) return null;
    const secKey = String(sec.id || sec.name || '').toLowerCase();
    const subKey = String(subRef).toLowerCase();
    const cacheKey = `${secKey}:::${subKey}`;

    if (assignedProfCache.current.has(cacheKey)) {
      return assignedProfCache.current.get(cacheKey);
    }

    const sub = getSubject(subRef) || { id: subRef, code: subRef };
    const subCode = sub.code || sub.id;
    const subId = sub.id;

    let result = null;

    // 1. Direct match on section.subjectInstructors (most authoritative)
    if (sec.subjectInstructors) {
      const pId = sec.subjectInstructors[subCode] || sec.subjectInstructors[subId] || sec.subjectInstructors[subRef];
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
        return mappedSubs.some(s => s === subCode || s === subId || s === subRef);
      });
      if (profByMap) result = profByMap;
    }

    // 3. Fallback: only if exactly 1 professor assigned to this section specializes in this subject
    if (!result) {
      const sectionProfs = getSectionProfs(sec);
      const candidateProfs = sectionProfs.filter(p => {
        return (p.specialization || []).some(sp => sp === subId || sp === subCode || (sub.name && sp === sub.name));
      });

      if (candidateProfs.length === 1) {
        result = candidateProfs[0];
      }
    }

    assignedProfCache.current.set(cacheKey, result);
    if (subCode && String(subCode).toLowerCase() !== subKey) {
      assignedProfCache.current.set(`${secKey}:::${String(subCode).toLowerCase()}`, result);
    }
    if (subId && String(subId).toLowerCase() !== subKey) {
      assignedProfCache.current.set(`${secKey}:::${String(subId).toLowerCase()}`, result);
    }

    return result;
  }, [getSubject, profMap, getSectionProfs]);

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

    return {
      totalSections: sections.length,
      totalProfessors: professors.length,
      totalSubjects: subjects.length,
      totalEnrolledLinks,
      totalAssignedLinks,
      sectionsNeedingTeachers
    };
  }, [sections, professors, subjects, getAssignedProf]);

  // --- Inline Instructor Change for a Section Subject ---
  const handleAssignInstructorInline = async (section, subRef, newProfId) => {
    const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
    const subCode = sub.code || sub.id;

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
          const updatedSpecs = curSpecs.some(sp => sp === sub.id || sp === sub.code || sp === subCode)
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

  // ⚡ 1-Click Auto-Match Teachers for a Section
  const handleAutoMatchSectionTeachers = async (sec) => {
    const enrolled = sec.subjects || [];
    let matchCount = 0;
    const batch = writeBatch(db);
    const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };
    const profUpdates = {}; // profId -> { assignedSections, sectionSubjectMap }

    enrolled.forEach(subRef => {
      const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
      const subCode = sub?.code || subRef;
      const alreadyAssigned = getAssignedProf(sec, subRef);

      if (!alreadyAssigned && sub) {
        const candidates = professors.filter(p => (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name));
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
      toast.success(`⚡ Automatically matched teachers for ${matchCount} subject(s) in ${sec.name}!`);
    } else {
      toast.info(`All subjects in ${sec.name} already have instructors or no specialized faculty were found.`);
    }
  };

  // ⚡ 1-Click Auto-Match Teachers across ALL sections
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
        const subCode = sub?.code || subRef;
        const alreadyAssigned = getAssignedProf(sec, subRef);

        if (!alreadyAssigned && sub) {
          const candidates = professors.filter(p => (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name));
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
      toast.success(`⚡ Auto-matched ${totalMatches} teacher assignment(s) across all sections!`);
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
      const key = sub?.code || subRef;
      if (!nextMap[key] && !nextMap[subRef]) {
        const candidates = professors.filter(p => sub && (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name));
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
      toast.success(`⚡ Automatically filled ${count} instructor(s)!`);
    } else {
      toast.info("All subjects already have instructors or no specialized faculty were found.");
    }
  };

  // --- Open Edit Modal for an Entity ---
  const handleOpenEditModal = (type, item) => {
    setEditingEntity({ type, item });
    if (type === 'section') {
      const subInstructorMap = { ...(item.subjectInstructors || {}) };
      (item.subjects || []).forEach(subRef => {
        const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
        const subCode = sub.code || sub.id;
        if (!subInstructorMap[subCode] && !subInstructorMap[subRef]) {
          const assignedProf = getAssignedProf(item, subRef);
          if (assignedProf) {
            subInstructorMap[subCode] = assignedProf.id;
            subInstructorMap[subRef] = assignedProf.id;
          }
        }
      });
      setStagedAssignedSubjects(item.subjects || []);
      setStagedFacultyMap(subInstructorMap);
    } else if (type === 'faculty') {
      const secSubjectMap = { ...(item.sectionSubjectMap || {}) };
      const assignedSecs = item.assignedSections || [];
      assignedSecs.forEach(secId => {
        const sec = sections.find(s => s.id === secId || s.name === secId);
        if (sec && (!secSubjectMap[sec.id] || secSubjectMap[sec.id].length === 0)) {
          const matching = (sec.subjects || []).filter(subRef => {
            const assigned = getAssignedProf(sec, subRef);
            return assigned && assigned.id === item.id;
          });
          secSubjectMap[sec.id] = matching;
        }
      });
      setStagedAssignedSections(assignedSecs);
      setStagedAssignedSubjects(item.specialization || []);
      setStagedFacultyMap(secSubjectMap);
    } else if (type === 'subject') {
      const enrolled = sections.filter(s =>
        (s.subjects || []).some(sub => sub === item.id || sub === item.code || sub === item.name)
      ).map(s => s.id);
      const specialized = professors.filter(p =>
        (p.specialization || []).some(sub => sub === item.id || sub === item.code || sub === item.name)
      ).map(p => p.id);
      setStagedAssignedSections(enrolled);
      setStagedFacultyMap({ assignedProfessors: specialized });
    }
  };

  // --- Save Staged Entity in Modal ---
  const handleSaveModal = async () => {
    if (!editingEntity) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const { type, item } = editingEntity;

      if (type === 'section') {
        // 1. Update section's subjects and subjectInstructors mapping
        batch.update(doc(db, 'sections', String(item.id)), {
          subjects: stagedAssignedSubjects,
          subjectInstructors: stagedFacultyMap
        });

        // 2. Map professors: profId -> list of subjects taught in this section
        const profToSubjects = {};
        Object.entries(stagedFacultyMap).forEach(([subRef, pId]) => {
          if (pId && stagedAssignedSubjects.some(s => s === subRef)) {
            if (!profToSubjects[pId]) profToSubjects[pId] = [];
            profToSubjects[pId].push(subRef);
          }
        });

        // 3. Update professors who are assigned
        Object.entries(profToSubjects).forEach(([pId, subRefs]) => {
          const prof = professors.find(p => p.id === pId);
          if (prof) {
            const curSecs = prof.assignedSections || [];
            const newSecs = curSecs.includes(item.id) || (item.name && curSecs.includes(item.name))
              ? curSecs
              : [...curSecs, item.id];

            let curSpecs = [...(prof.specialization || [])];
            subRefs.forEach(subRef => {
              const subObj = subjects.find(s => s.id === subRef || s.code === subRef);
              const codeOrId = subObj?.code || subObj?.id || subRef;
              if (!curSpecs.includes(codeOrId) && (!subObj || !curSpecs.includes(subObj.id))) {
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
          const hadSec = (prof.assignedSections || []).includes(item.id) || (prof.assignedSections || []).includes(item.name);
          if (hadSec && !profToSubjects[prof.id]) {
            const newSecs = (prof.assignedSections || []).filter(s => s !== item.id && s !== item.name);
            const newMap = { ...(prof.sectionSubjectMap || {}) };
            delete newMap[item.id];
            delete newMap[item.name];

            batch.update(doc(db, 'professors', String(prof.id)), {
              assignedSections: newSecs,
              sectionSubjectMap: newMap
            });
          }
        });
      } else if (type === 'faculty') {
        // 1. Update professor's assignedSections, specialization, and sectionSubjectMap
        batch.update(doc(db, 'professors', String(item.id)), {
          specialization: stagedAssignedSubjects,
          assignedSections: stagedAssignedSections,
          sectionSubjectMap: stagedFacultyMap
        });

        // 2. Auto-enroll sections in the specific subjects chosen
        stagedAssignedSections.forEach(secId => {
          const sec = sections.find(s => s.id === secId || s.name === secId);
          if (sec) {
            const chosenSubs = stagedFacultyMap[sec.id] || [];
            let updatedSubjs = [...(sec.subjects || [])];
            let changed = false;
            const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };

            chosenSubs.forEach(subRef => {
              const subObj = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
              const val = subObj?.code || subObj?.id || subRef;
              if (!updatedSubjs.some(existing => existing === val || (subObj && (existing === subObj.id || existing === subObj.code)))) {
                updatedSubjs.push(val);
                changed = true;
              }
              updatedSubjectInstructors[val] = item.id;
              changed = true;
            });

            if (changed) {
              batch.update(doc(db, 'sections', String(sec.id)), {
                subjects: updatedSubjs,
                subjectInstructors: updatedSubjectInstructors
              });
            }
          }
        });
      } else if (type === 'subject') {
        const code = item.code || item.id;
        // 1. Sync sections
        sections.forEach(sec => {
          const wasEnrolled = (sec.subjects || []).some(s => s === item.id || s === code);
          const isNowEnrolled = stagedAssignedSections.includes(sec.id);

          if (!wasEnrolled && isNowEnrolled) {
            batch.update(doc(db, 'sections', String(sec.id)), { subjects: [...(sec.subjects || []), code] });
          } else if (wasEnrolled && !isNowEnrolled) {
            const updated = (sec.subjects || []).filter(s => s !== item.id && s !== code);
            const updatedInst = { ...(sec.subjectInstructors || {}) };
            delete updatedInst[code];
            delete updatedInst[item.id];
            batch.update(doc(db, 'sections', String(sec.id)), {
              subjects: updated,
              subjectInstructors: updatedInst
            });
          }
        });

        // 2. Sync professors
        const profIds = stagedFacultyMap.assignedProfessors || [];
        professors.forEach(prof => {
          const wasAssigned = (prof.specialization || []).some(s => s === item.id || s === code);
          const isNowAssigned = profIds.includes(prof.id);

          if (!wasAssigned && isNowAssigned) {
            batch.update(doc(db, 'professors', String(prof.id)), { specialization: [...(prof.specialization || []), code] });
          } else if (wasAssigned && !isNowAssigned) {
            const updated = (prof.specialization || []).filter(s => s !== item.id && s !== code);
            batch.update(doc(db, 'professors', String(prof.id)), { specialization: updated });
          }
        });
      }

      await batch.commit();
      assignedProfCache.current.clear();
      subjectProfOptionsCache.current.clear();
      toast.success("Assignments updated successfully!");
      setEditingEntity(null);
    } catch (err) {
      console.error("Error saving assignments modal:", err);
      toast.error("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtering & Searching ---
  const filteredSections = useMemo(() => {
    return sections.filter(sec => {
      const secDept = resolveDeptCode(sec.program) || resolveDeptCode(sec.department);
      const matchDept = departmentFilter === 'All' || secDept === departmentFilter;
      const matchSearch = !searchQuery.trim() || 
        (sec.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (sec.program || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchDept || !matchSearch) return false;

      if (onlyNeedsAttention) {
        const enrolled = sec.subjects || [];
        if (enrolled.length === 0) return true;
        const hasMissing = enrolled.some(subRef => !getAssignedProf(sec, subRef));
        return hasMissing;
      }

      return true;
    });
  }, [sections, departmentFilter, searchQuery, onlyNeedsAttention, getAssignedProf]);

  const filteredFaculty = useMemo(() => {
    return professors.filter(prof => {
      const profDept = resolveDeptCode(prof.department);
      const matchDept = departmentFilter === 'All' || profDept === departmentFilter || prof.department === departmentFilter;
      const fullName = (prof.name || `${prof.lastName || ''} ${prof.firstName || ''}`).toLowerCase();
      const matchSearch = !searchQuery.trim() || fullName.includes(searchQuery.toLowerCase());
      if (!matchDept || !matchSearch) return false;

      if (onlyNeedsAttention) {
        return (prof.assignedSections || []).length === 0 || (prof.specialization || []).length === 0;
      }

      return true;
    });
  }, [professors, departmentFilter, searchQuery, onlyNeedsAttention]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(sub => {
      const subDepts = (sub.departments || (sub.department ? [sub.department] : [])).map(resolveDeptCode);
      const matchDept = departmentFilter === 'All' || subDepts.includes(departmentFilter);
      const codeStr = (sub.code || '').toLowerCase();
      const nameStr = (sub.name || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || codeStr.includes(q) || nameStr.includes(q);
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

      return true;
    });
  }, [subjects, departmentFilter, searchQuery, onlyNeedsAttention, enrolledSubjectCodesSet, specializedSubjectCodesSet]);

  // Progressive windowing: start with 12 items for instant (<16ms) initial render
  const [visibleLimit, setVisibleLimit] = useState(12);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setVisibleLimit(12);
  }, [viewMode, departmentFilter, searchQuery, onlyNeedsAttention]);

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
  const renderSubjectChip = (sub, onRemove) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '16px',
      background: 'rgba(86, 69, 238, 0.12)', border: '1px solid rgba(86, 69, 238, 0.3)',
      fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-primary, #5645ee)'
    }}>
      <span>{sub.code || sub.name}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}
      >
        ×
      </button>
    </div>
  );

  const renderSectionChip = (sec, onRemove) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '16px',
      background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
      fontSize: '0.78rem', fontWeight: '600', color: '#059669'
    }}>
      <span>{sec.name}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}
      >
        ×
      </button>
    </div>
  );

  const renderFacultyChip = (prof, onRemove) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '16px',
      background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
      fontSize: '0.78rem', fontWeight: '600', color: '#2563eb'
    }}>
      <span>{prof.name || `${prof.lastName}, ${prof.firstName}`}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}
      >
        ×
      </button>
    </div>
  );

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
                      <strong style={{ fontSize: '1rem', color: 'var(--accent-dark)' }}>{sec.name}</strong>
                      <span className="hub-entity-badge" style={{ background: 'rgba(86, 69, 238, 0.1)', color: 'var(--accent-primary)' }}>
                        {sec.program} • Y{sec.yearLevel}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {missingCount > 0 ? (
                        <>
                          <span className="hub-alert-chip">⚠️ {missingCount} unassigned</span>
                          <button
                            className="hub-quick-btn"
                            style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                            onClick={() => handleAutoMatchSectionTeachers(sec)}
                            title="Automatically assign specialized faculty to unassigned subjects"
                          >
                            ⚡ Auto-Match
                          </button>
                        </>
                      ) : enrolled.length > 0 ? (
                        <span className="hub-success-chip">✓ Fully Assigned</span>
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
                          <div key={subRef} className="hub-mapping-row" style={isOrphan ? { background: 'rgba(239, 68, 68, 0.06)', borderLeft: '3px solid #dc2626' } : undefined}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.82rem', color: isOrphan ? '#dc2626' : 'var(--accent-dark)' }}>
                                {isOrphan ? `⚠️ ${sub.code}` : sub.code}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: isOrphan ? '#b91c1c' : 'var(--text-muted)' }}>
                                {isOrphan ? 'Legacy / Unmatched ID' : sub.name}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '240px', justifyContent: 'flex-end' }}>
                              {!isOrphan ? (
                                <InlineInstructorSelect
                                  section={sec}
                                  subRef={subRef}
                                  assignedProf={assignedProf}
                                  onAssign={handleAssignInstructorInline}
                                  getSubjectProfessors={getSubjectProfessors}
                                />
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleRemoveSubjectFromSectionInline(sec, subRef)}
                                className="hub-quick-btn"
                                style={{
                                  background: isOrphan ? '#dc2626' : 'transparent',
                                  color: isOrphan ? '#ffffff' : 'var(--text-muted)',
                                  borderColor: isOrphan ? '#dc2626' : 'var(--border-color)',
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  fontWeight: '700'
                                }}
                                title={isOrphan ? `Remove orphan ${subRef} from section` : `Unenroll ${sub.code} from section`}
                              >
                                {isOrphan ? '🗑️ Remove' : '×'}
                              </button>
                            </div>
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
                      <strong style={{ fontSize: '0.95rem', color: 'var(--accent-dark)' }}>{prof.name || `${prof.lastName}, ${prof.firstName}`}</strong>
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
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>Specialization Subjects:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {specSubjects.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>None assigned</span>
                        ) : (
                          specSubjects.map(subRef => {
                            const sub = getSubject(subRef) || { code: subRef };
                            return (
                              <span key={subRef} style={{ fontSize: '0.72rem', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(86, 69, 238, 0.1)', color: 'var(--accent-primary)' }}>
                                {sub.code}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Assigned Sections and specific subjects taught */}
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>Assigned Sections & Subjects Taught:</span>
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
                                <span style={{ fontWeight: '700', color: 'var(--accent-dark)' }}>{sec.name}</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {actuallyTaughtSubjects.length > 0 ? (
                                    actuallyTaughtSubjects.map(mRef => {
                                      const mSub = getSubject(mRef);
                                      return (
                                        <span key={mRef} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: '700' }}>
                                          {mSub?.code || mRef}
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
                    <div className="hub-entity-title">
                      <strong style={{ fontSize: '0.95rem', color: 'var(--accent-dark)' }}>{sub.code}</strong>
                      <span className="hub-entity-badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
                        {sub.credits} Units • {sub.category}
                      </span>
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Enrolled Sections & Assigned Instructors */}
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>
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
                                style={{ 
                                  fontSize: '0.72rem', 
                                  fontWeight: '600', 
                                  padding: '2px 8px', 
                                  borderRadius: '12px', 
                                  background: assignedProf ? 'rgba(86, 69, 238, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                  color: assignedProf ? 'var(--accent-primary)' : '#dc2626',
                                  border: assignedProf ? '1px solid rgba(86, 69, 238, 0.2)' : '1px solid rgba(239, 68, 68, 0.25)'
                                }}
                                title={assignedProf ? `Taught by ${assignedProf.name}` : 'Needs instructor'}
                              >
                                {sec.name} {assignedProf ? `(${assignedProf.name?.split(' ')[0] || assignedProf.lastName})` : '⚠️'}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Qualified Faculty */}
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>
                        Specialized Faculty ({qualifiedProfs.length}):
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {qualifiedProfs.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#ef4444' }}>⚠️ No faculty specialized</span>
                        ) : (
                          qualifiedProfs.map(prof => (
                            <span key={prof.id} style={{ fontSize: '0.72rem', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
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
      {editingEntity && (
        <div className="modal-overlay" onClick={() => !isSaving && setEditingEntity(null)}>
          <div className="modal-content" style={{ width: '650px', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent-primary)', fontSize: '1.2rem' }}>
                  Configure {editingEntity.type === 'section' ? `Section: ${editingEntity.item.name}` : editingEntity.type === 'faculty' ? `Faculty: ${editingEntity.item.name}` : `Subject: ${editingEntity.item.code}`}
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Manage cross-entity assignments and save changes atomically
                </p>
              </div>
              <button onClick={() => !isSaving && setEditingEntity(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '5px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* SECTION EDITING */}
            {editingEntity.type === 'section' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Enrolled Subjects</label>
                  <AutocompleteMultiSelect
                    allOptions={subjects}
                    options={subjects}
                    selectedIds={stagedAssignedSubjects}
                    onToggle={(item) => {
                      const id = typeof item === 'object' && item !== null ? item.id : item;
                      setStagedAssignedSubjects(prev =>
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                      );
                    }}
                    renderChip={renderSubjectChip}
                    placeholder="Search subject to enroll..."
                  />
                </div>

                {stagedAssignedSubjects.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Assigned Instructor per Subject</label>
                      <button
                        type="button"
                        onClick={handleAutoAssignStagedTeachers}
                        className="hub-quick-btn"
                        style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                      >
                        ⚡ Auto-Assign Teachers
                      </button>
                    </div>
                    {stagedAssignedSubjects.map(subRef => {
                      const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef, name: subRef };
                      const subKey = sub.code || sub.id;
                      const curProfId = stagedFacultyMap[subKey] || stagedFacultyMap[subRef] || '';
                      const specProfs = professors.filter(p => (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name));

                      return (
                        <div key={subRef} className="hub-mapping-row">
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{sub.code}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub.name}</span>
                          </div>
                          <select
                            className="form-select"
                            style={{ margin: 0, width: '220px', padding: '6px 10px', fontSize: '0.8rem' }}
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
                                    ✨ {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="All Faculty">
                              {professors.filter(p => !specProfs.some(sp => sp.id === p.id)).map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* FACULTY EDITING */}
            {editingEntity.type === 'faculty' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Specialization Subjects</label>
                  <AutocompleteMultiSelect
                    allOptions={subjects}
                    options={subjects}
                    selectedIds={stagedAssignedSubjects}
                    onToggle={(item) => {
                      const id = typeof item === 'object' && item !== null ? item.id : item;
                      setStagedAssignedSubjects(prev =>
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                      );
                    }}
                    renderChip={renderSubjectChip}
                    placeholder="Search subject..."
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Assigned Sections</label>
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
                    placeholder="Search section..."
                  />
                </div>

                {stagedAssignedSections.length > 0 && stagedAssignedSubjects.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Choose Specific Subject(s) Taught per Section</label>
                    {stagedAssignedSections.map(secId => {
                      const sec = sections.find(s => s.id === secId || s.name === secId) || { id: secId, name: secId };
                      const chosenSubs = stagedFacultyMap[sec.id] || [];

                      return (
                        <div key={sec.id} style={{ padding: '10px 14px', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{sec.name}</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {stagedAssignedSubjects.map(subRef => {
                              const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
                              const subKey = sub.code || sub.id;
                              const isChecked = chosenSubs.includes(subKey) || chosenSubs.includes(sub.id);

                              return (
                                <button
                                  key={subKey}
                                  type="button"
                                  onClick={() => {
                                    setStagedFacultyMap(prev => {
                                      const current = prev[sec.id] || [];
                                      const updated = current.includes(subKey)
                                        ? current.filter(s => s !== subKey && s !== sub.id)
                                        : [...current, subKey];
                                      return { ...prev, [sec.id]: updated };
                                    });
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '16px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    border: isChecked ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                    background: isChecked ? 'rgba(86, 69, 238, 0.12)' : 'var(--bg-surface)',
                                    color: isChecked ? 'var(--accent-primary)' : 'var(--text-muted)'
                                  }}
                                >
                                  {isChecked ? '✓ ' : '+ '}{sub.code}
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
            )}

            {/* SUBJECT EDITING */}
            {editingEntity.type === 'subject' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Enrolled Sections</label>
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
                    placeholder="Search section..."
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Specialized Faculty</label>
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
                    placeholder="Search faculty..."
                  />
                </div>
              </div>
            )}

            <div className="mgmt-modal-actions" style={{ marginTop: '20px' }}>
              <button className="mgmt-cancel-btn" onClick={() => setEditingEntity(null)} disabled={isSaving}>
                Cancel
              </button>
              <button className="btn" onClick={handleSaveModal} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Modal */}
      <QuickCreateModal
        isOpen={quickCreateState.isOpen}
        type={quickCreateState.type}
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
