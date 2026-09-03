// src/utils/subjectLabDetector.js
import { initialSubjects } from '../config/initialData.js';

/**
 * Known curriculum mappings for BSCS, BSFT, and other majors based on institutional data.
 */
const KNOWN_LAB_CODES = {
  // BSCS Computer Labs
  'CS 103': { labType: 'computer', reason: 'BSCS Programming Laboratory (CS 103)' },
  'CS 107': { labType: 'computer', reason: 'BSCS Applications Development Laboratory (CS 107)' },
  'CS 108': { labType: 'computer', reason: 'BSCS Information Management Laboratory (CS 108)' },
  'CS 110': { labType: 'computer', reason: 'BSCS Object Oriented Programming Laboratory (CS 110)' },
  'CS 116': { labType: 'computer', reason: 'BSCS Programming Languages Laboratory (CS 116)' },
  'CS 117': { labType: 'computer', reason: 'BSCS Computer Architecture & Assembly Lab (CS 117)' },
  'FREE ELECTIVE 102': { labType: 'computer', reason: 'BSCS Photo & Video Editing Lab' },
  'FREE ELECTIVE 104': { labType: 'computer', reason: 'BSCS Computer System Services Lab' },
  'ELECTIVE 102': { labType: 'computer', reason: 'BSCS Multimedia/Editing Lab' },
  'ELECTIVE 104': { labType: 'computer', reason: 'BSCS System Services Lab' },

  // BSFT Food Labs
  'FT 110': { labType: 'food', reason: 'BSFT Food Processing Laboratory (FT 110)' },
  'FT 107': { labType: 'food', reason: 'BSFT Food Microbiology Laboratory (FT 107)' },
  'FT 113': { labType: 'food', reason: 'BSFT Food Analysis Laboratory (FT 113)' },
  'FT 112': { labType: 'food', reason: 'BSFT Food Engineering Laboratory (FT 112)' },
  'FT 115L': { labType: 'food', reason: 'BSFT Packaging & Labelling Laboratory (FT 115L)' },
  'CHEM 102': { labType: 'food', reason: 'BSFT Qualitative Chemistry Laboratory (Chem 102)' },
  'CHEM 104': { labType: 'food', reason: 'BSFT General Biochemistry Laboratory (Chem 104)' },
  'ELECTIVE 2': { labType: 'food', reason: 'BSFT Meat Science & Technology Laboratory' },

  // BSOA Labs
  'OAC 121': { labType: 'computer', reason: 'BSOA Internet Research Laboratory (OAC 121)' },
  'OAC 118': { labType: 'computer', reason: 'BSOA Computer Office Internship (OAC 118)' },
  'OAEL 116': { labType: 'computer', reason: 'BSOA Office Internship Laboratory' },
};

/**
 * Suggests the academic department based on subject code prefix.
 * @param {string} code 
 * @returns {string|null} Department code ('BSCS', 'BSFT', 'BSOA', 'BAEL') or null
 */
export function suggestDepartmentFromCode(code) {
  if (!code) return null;
  const clean = code.trim().toUpperCase();

  if (/^(BSCS|CS|IT|CCS|IS|CPE)\b|^(BSCS|CS|IT|CCS|IS|CPE)\d/i.test(clean)) {
    return 'BSCS';
  }
  if (/^(BSFT|FT|CHEM|BIO|FST)\b|^(BSFT|FT|CHEM|BIO|FST)\d/i.test(clean)) {
    return 'BSFT';
  }
  if (/^(BSOA|OA|OAC|OAEL|OFAD)\b|^(BSOA|OA|OAC|OAEL|OFAD)\d/i.test(clean)) {
    return 'BSOA';
  }
  if (/^(BAEL|ELS|ELSM|FL|ENG|LIT)\b|^(BAEL|ELS|ELSM|FL|ENG|LIT)\d/i.test(clean)) {
    return 'BAEL';
  }
  return null;
}

/**
 * Detects if a subject requires a laboratory (Computer Lab or Food Lab).
 * 
 * @param {Object} subjectData - The subject form state
 * @param {string} subjectData.code - Subject Code (e.g. 'CS 103', 'FT 110')
 * @param {string} subjectData.name - Subject Name (e.g. 'Computer Programming 1')
 * @param {string[]} [subjectData.departments] - Array of assigned departments
 * @param {string} [subjectData.category] - 'Major' or 'Minor'
 * @param {number|string} [subjectData.credits] - Number of credits
 * @param {Array} [existingSubjects] - Optional array of currently loaded subjects in the system
 * @returns {{ requiredLab: boolean, isFoodLab: boolean, labType: 'computer'|'food'|null, reason: string|null }}
 */
export function detectLabRequirement(subjectData = {}, existingSubjects = []) {
  const code = (subjectData.code || '').trim();
  const name = (subjectData.name || '').trim();
  const category = subjectData.category || 'Major';
  const departments = Array.isArray(subjectData.departments) ? subjectData.departments : [];
  const credits = Number(subjectData.credits);

  const cleanCode = code.toUpperCase().replace(/\s+/g, ' ');
  const codeNoSpaces = code.toUpperCase().replace(/\s+/g, '');
  const cleanName = name.toLowerCase();

  // If designated as a Minor subject (e.g. Gen Ed / PE / NSTP), unless explicitly named "Laboratory", usually no lab
  const isExplicitLabInName = /\b(lab|laboratory|laboratories)\b|\(lab\)/i.test(cleanName);
  const isExplicitLabInCode = /(?:^|\s|-|_|\d)L$|\bLAB\b/i.test(cleanCode);

  if (category === 'Minor' && !isExplicitLabInName && !isExplicitLabInCode) {
    return { requiredLab: false, isFoodLab: false, labType: null, reason: null };
  }

  // Helper to determine whether subject relates to BSFT or BSCS
  const hasBSFT = departments.includes('BSFT') || /^(FT|CHEM|FST|BIO)\b/i.test(cleanCode);
  const hasBSCS = departments.includes('BSCS') || /^(CS|IT|CCS|IS|CPE)\b/i.test(cleanCode);
  const hasBSOA = departments.includes('BSOA') || /^(OA|OAC|OAEL)\b/i.test(cleanCode);

  // ─────────────────────────────────────────────────────────────
  // 1. Direct match against known lab curriculum codes
  // ─────────────────────────────────────────────────────────────
  for (const [knownCode, config] of Object.entries(KNOWN_LAB_CODES)) {
    const normKnown = knownCode.replace(/\s+/g, '');
    if (codeNoSpaces === normKnown || cleanCode === knownCode) {
      if (config.labType === 'food' || hasBSFT) {
        return { requiredLab: false, isFoodLab: true, labType: 'food', reason: config.reason };
      }
      return { requiredLab: true, isFoodLab: false, labType: 'computer', reason: config.reason };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Check against existing subjects in database & initialSubjects
  // ─────────────────────────────────────────────────────────────
  const allKnown = [...(existingSubjects || []), ...(initialSubjects || [])];
  const matchedSubject = allKnown.find(s => {
    if (!s || !s.code) return false;
    const sCodeNoSpaces = String(s.code).toUpperCase().replace(/\s+/g, '');
    return sCodeNoSpaces === codeNoSpaces;
  });

  if (matchedSubject) {
    if (matchedSubject.isFoodLab || (matchedSubject.requiredLab && (hasBSFT || matchedSubject.department === 'BSFT'))) {
      return {
        requiredLab: false,
        isFoodLab: true,
        labType: 'food',
        reason: `Matched known BSFT subject (${matchedSubject.code}): Requires Food Laboratory`
      };
    }
    if (matchedSubject.requiredLab) {
      return {
        requiredLab: true,
        isFoodLab: false,
        labType: 'computer',
        reason: `Matched known subject (${matchedSubject.code}): Requires Computer Laboratory`
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Explicit Code Suffix indicating Laboratory (e.g. FT 115L, CS 103L, CHEM 102L)
  // ─────────────────────────────────────────────────────────────
  if (isExplicitLabInCode) {
    if (hasBSFT) {
      return {
        requiredLab: false,
        isFoodLab: true,
        labType: 'food',
        reason: `Subject code suffix indicates Food Laboratory`
      };
    }
    return {
      requiredLab: true,
      isFoodLab: false,
      labType: 'computer',
      reason: `Subject code suffix indicates Computer Laboratory`
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Explicit Name containing "Lab" / "Laboratory"
  // ─────────────────────────────────────────────────────────────
  if (isExplicitLabInName) {
    if (hasBSFT || /food|meat|bacteri|microbiol|chemist|bio/i.test(cleanName)) {
      return {
        requiredLab: false,
        isFoodLab: true,
        labType: 'food',
        reason: `Subject title indicates Food Laboratory`
      };
    }
    return {
      requiredLab: true,
      isFoodLab: false,
      labType: 'computer',
      reason: `Subject title indicates Computer Laboratory`
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. BSFT Major Subject Curriculum Topics
  // ─────────────────────────────────────────────────────────────
  if (hasBSFT || departments.includes('BSFT')) {
    const foodLabKeywords = [
      'food processing',
      'processing ii',
      'processing i',
      'food microbiology',
      'microbiology',
      'food analysis',
      'food engineering',
      'meat science',
      'qualitative chemistry',
      'quantitative chemistry',
      'general biochemistry',
      'biochemistry',
      'organic chemistry',
      'inorganic chemistry',
      'food chemistry',
      'sensory evaluation',
      'food packaging and labelling',
      'packaging and labelling',
      'fermentation',
      'post-harvest'
    ];

    const matchesFoodTopic = foodLabKeywords.some(kw => cleanName.includes(kw));
    // Check if fractional credits characteristic of BSFT lab subjects (e.g., 4.25, 7.5, 2.25)
    const hasFractionalLabCredits = !isNaN(credits) && (credits === 4.25 || credits === 7.5 || credits === 2.25);

    if (matchesFoodTopic || hasFractionalLabCredits) {
      return {
        requiredLab: false,
        isFoodLab: true,
        labType: 'food',
        reason: `BSFT major curriculum topic requires Food Laboratory`
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. BSCS Major Subject Curriculum Topics
  // ─────────────────────────────────────────────────────────────
  if (hasBSCS || departments.includes('BSCS')) {
    const compLabKeywords = [
      'programming',
      'coding',
      'object oriented',
      'oop',
      'information management',
      'database',
      'dbms',
      'sql',
      'applications development',
      'application development',
      'app dev',
      'web development',
      'web systems',
      'web design',
      'mobile development',
      'mobile app',
      'computer architecture',
      'assembly programming',
      'assembly language',
      'computer system services',
      'system services',
      'photo editing',
      'video editing',
      'multimedia',
      'computer graphics',
      'animation',
      'networking',
      'computer networks',
      'cisco',
      'operating system',
      'machine learning',
      'artificial intelligence',
      'deep learning',
      'data structures',
      'programming languages',
      'hardware'
    ];

    const matchesCompTopic = compLabKeywords.some(kw => cleanName.includes(kw));

    if (matchesCompTopic) {
      return {
        requiredLab: true,
        isFoodLab: false,
        labType: 'computer',
        reason: `BSCS major curriculum topic requires Computer Laboratory`
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 8. General Major Subject Rule (BSCS, BSFT, BSOA)
  // If it is a Major subject in BSCS, BSFT, or BSOA, automatically check the laboratory
  // even if the subject name is different from predefined keyword lists.
  // ─────────────────────────────────────────────────────────────
  if (category === 'Major') {
    if (hasBSFT || departments.includes('BSFT')) {
      return {
        requiredLab: false,
        isFoodLab: true,
        labType: 'food',
        reason: 'BSFT Major Subject requires Food Laboratory'
      };
    }

    if (hasBSCS || departments.includes('BSCS')) {
      return {
        requiredLab: true,
        isFoodLab: false,
        labType: 'computer',
        reason: 'BSCS Major Subject requires Computer Laboratory'
      };
    }

    if (hasBSOA || departments.includes('BSOA')) {
      return {
        requiredLab: true,
        isFoodLab: false,
        labType: 'computer',
        reason: 'BSOA Major Subject requires Computer Laboratory'
      };
    }
  }

  return { requiredLab: false, isFoodLab: false, labType: null, reason: null };
}

