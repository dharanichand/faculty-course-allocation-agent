// ============================================================================
// DATASET BUILDER
//
// Turns the three spreadsheet inputs the department actually maintains into
// the records the application stores in MongoDB:
//   1. Workload_AY_2026-27_I_Sem.xlsx  -> courses (+ section counts, hours),
//      the faculty who carry a workload, and the department's own official
//      Lead Faculty sheet (who is meant to coordinate each course)
//   2. submissions_YYYY-MM-DD.xlsx     -> ranked course preferences
//
// Rules implemented here (all in one place so they are easy to change):
//   * The faculty roster is the UNION of both files, so nobody is dropped.
//   * Faculty who did not submit the preference form fall back to exactly
//     what the Workload sheet shows them teaching - never a guess.
//   * Designation decides priority tier, course quota and prescribed hours
//     (using each person's own stated hours from the sheet when present).
//
// Pure functions only (no database access) so it can be unit-tested.
// ============================================================================
import XLSX from 'xlsx';

import {TIER_LABELS, QUOTA_BY_TIER, HOURS_BY_TIER, normalizeDesignation} from './designationPolicy.js';
export {TIER_LABELS, QUOTA_BY_TIER, HOURS_BY_TIER, normalizeDesignation};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const normName = v => clean(v).toLowerCase().replace(/&/g, ' and ').replace(/visualisation/g, 'visualization').replace(/[^a-z0-9]+/g, '');
const personKey = v => clean(v).toLowerCase().replace(/\b(dr|mr|mrs|ms|prof|miss)\b\.?/g, '').replace(/[^a-z]+/g, '');
// Order-insensitive, abbreviation-tolerant name matcher for the Lead Faculty
// sheet, where names are sometimes given as "T. Phanindra" for someone whose
// full name is "Phanindra Thota" elsewhere. Every token on each side must
// correspond to a token on the other side (exact, or one is a short initial
// prefix of the other) - this only fires when both names really do reduce to
// the same set of tokens, so it won't cross-match two different people.
const nameTokens = v => clean(v).toLowerCase().replace(/\b(dr|mr|mrs|ms|prof|miss)\b\.?/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
export function namesLikelyMatch(a, b) {
  const at = nameTokens(a), bt = nameTokens(b);
  if (!at.length || !bt.length || at.length !== bt.length) return false;
  const tokenMatch = (x, y) => x === y || (x.length <= 3 && y.startsWith(x)) || (y.length <= 3 && x.startsWith(y));
  const usedB = new Set();
  for (const x of at) {
    const i = bt.findIndex((y, idx) => !usedB.has(idx) && tokenMatch(x, y));
    if (i === -1) return false;
    usedB.add(i);
  }
  return true;
}
const romanOf = v => {
  const s = clean(v).toUpperCase();
  if (['I', 'II', 'III', 'IV'].includes(s)) return s;
  return ({1: 'I', 2: 'II', 3: 'III', 4: 'IV'})[Number(s)] || s;
};
const programOf = v => /m\.?\s*tech/i.test(String(v)) ? 'M. Tech.' : 'B. Tech.';
export const padId = v => String(parseInt(String(v).replace(/\D/g, ''), 10)).padStart(5, '0');

// Deterministic PRNG so re-running the import always produces the same
// synthetic preferences (reproducible datasets, stable tests).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rowsOf = (wb, name) => {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" not found in workload workbook`);
  return XLSX.utils.sheet_to_json(ws, {header: 1, defval: null, raw: true});
};

// ---------------------------------------------------------------------------
// Preference token (as typed in the submission form)  ->  course name(s)
// ---------------------------------------------------------------------------
export const TOKEN_TO_COURSE_NAMES = {
  'PIC': ['Programming In C'],
  'AgenticTools': ['Agentic Tools'],
  'DS': ['Data Structures'],
  'DBMS': ['Database Management Systems'],
  'OOPJ': ['Object Oriented Programming Through Java'],
  'AI': ['Artificial Intelligence'],
  'DW': ['Data Wrangling and Visualization'],
  'Opt Tech': ['Optimization Techniques'],
  'ML': ['Machine Learning'],
  'CN': ['Computer Networks'],
  'Ethics': ['Computing Ethics'],
  'CV': ['Computer Vision'],
  'FrontEnd': ['Modern Front-End Frameworks'],
  'DB Sys': ['Database Systems'],
  'DA&V': ['Data Analytics and Visualization'],
  'API Sec': ['API Security and Authentication'],
  'Privacy': ['Privacy Preserving and Intrusion Detection'],
  'BDA': ['Big Data Analytics'],
  'Cloud': ['Cloud Computing'],
  'MLOps': ['MLOps'],
  'NLP': ['Natural Lanugage Processing'],
  'AgentAI': ['Agentic AI'],
  'OSSP': ['Operating Systems and Shell Programming']
};

// ---------------------------------------------------------------------------
// 1. Courses
// ---------------------------------------------------------------------------
export function parseCourses(workbook, {academicYear = '2026-27', semester = 'I'} = {}) {
  const list = rowsOf(workbook, 'List of Courses');
  const headerIdx = list.findIndex(r => clean(r[0]) === 'Program');
  if (headerIdx < 0) throw new Error('"List of Courses" header row not found');

  // Load-Calculation sheet: short names + fallback codes for "To be assigned".
  const loadRows = rowsOf(workbook, 'Load-Calculation');
  const loadHeader = loadRows.findIndex(r => clean(r[0]) === 'Program');
  const loadByKey = new Map();
  for (const r of loadRows.slice(loadHeader + 1)) {
    if (!clean(r[0]) || !Number.isFinite(Number(r[1]))) continue;
    loadByKey.set(`${programOf(r[0])}|${romanOf(r[2])}|${normName(r[4])}`, {short: clean(r[5]), code: clean(r[6])});
  }

  // Faculty WL sheet: observed weekly hours per course row + codes in use.
  const wl = parseWorkloadSheet(workbook);
  const hourSamples = new Map(), codeSamples = new Map();
  for (const f of wl.faculty) for (const c of f.courseRows) {
    const key = `${c.program}|${c.year}|${normName(c.name)}`;
    if (Number.isFinite(c.hours) && c.hours > 0) hourSamples.set(key, [...(hourSamples.get(key) || []), c.hours]);
    if (c.code) codeSamples.set(key, [...(codeSamples.get(key) || []), c.code]);
  }
  const mode = arr => {
    const m = new Map(); arr.forEach(x => m.set(x, (m.get(x) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  };

  const courses = [];
  const usedIds = new Set();
  for (const r of list.slice(headerIdx + 1)) {
    if (!clean(r[0]) || !Number.isFinite(Number(r[1]))) continue;      // skips the totals row
    const program = programOf(r[0]);
    const year = romanOf(r[2]);
    const name = clean(r[4]);
    const key = `${program}|${year}|${normName(name)}`;
    const load = loadByKey.get(key) || {};
    const L = Number(r[9]) || 0, T = Number(r[10]) || 0, P = Number(r[11]) || 0;
    const sectionCount = Number(r[13]) || 0;

    let code = clean(r[5]);
    if (!code || /to be assigned|new code/i.test(code)) {
      code = load.code && !/new code|to be assigned/i.test(load.code) ? load.code : '';
    }
    if (!code) {
      const observed = (codeSamples.get(key) || []).filter(c => /^[0-9]{2}[A-Z]/.test(c));
      code = observed.length ? observed.sort((a, b) => observed.filter(x => x === b).length - observed.filter(x => x === a).length)[0] : '';
    }
    if (!code) code = `NEW-${(load.short || name).replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8)}`;
    let courseId = code;
    if (usedIds.has(courseId)) courseId = `${code}-${year}${program === 'M. Tech.' ? 'PG' : ''}`;
    usedIds.add(courseId);

    // Hours a faculty member actually spends on ONE section per week.
    // Prefer what the department's own workload sheet shows; fall back to L+T+P.
    const ltp = L + T + P;
    const samples = hourSamples.get(key) || [];
    let hoursPerSection = ltp;
    if (samples.length >= 3) {
      const [m] = mode(samples);
      if (m >= ltp - 2 && m <= ltp + 3) hoursPerSection = m;
    }

    // Real workload sheets show ~1.3 faculty rows per section: a theory (lead)
    // instructor plus a co-instructor for the tutorial / practical batches.
    // Courses that have theory AND (tutorial or lab) hours therefore accept two
    // instructors per section; every other course has one.
    const instructorsPerSection = (L > 0 && (T + P) > 0) ? 2 : 1;
    const sections = Array.from({length: sectionCount}, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {sectionId: `${courseId}-S${n}`, sectionName: `S${n}`, hoursPerWeek: hoursPerSection, instructorSlots: instructorsPerSection};
    });

    courses.push({
      courseId, courseCode: courseId, courseName: name, shortName: load.short || '',
      department: 'CSE', academicYear, semester,
      program, year, courseType: clean(r[6]),
      credits: Number(r[12]) || 0, theoryHours: L, tutorialHours: T, labHours: P,
      hoursPerSection, sectionCount, instructorsPerSection, sections,
      studentStrength: Number(r[14]) || 0,
      requiredExpertise: [name], requiredQualification: [],
      status: 'open'
    });
  }
  // Scope the site to real CSE subjects only, i.e. the ones the CSE
  // department's own Faculty WL sheet actually staffs. The catalog also
  // lists a handful of M.Tech electives that have no CSE faculty attached
  // anywhere in Faculty WL (the one that does is taught by the Dean of a
  // different school, SOCI, not CSE) - those are excluded here.
  return courses.filter(c => c.program === 'B. Tech.');
}

// ---------------------------------------------------------------------------
// 1b. The department's own "Lead Faculty" sheet - who is meant to coordinate
// each course. Course titles here carry a "(N Sections)" suffix and use a
// different provisional code scheme than the other sheets, so matching is by
// (year, normalized title) only. '***' / blank means "not decided yet".
// ---------------------------------------------------------------------------
export function parseLeadFacultySheet(workbook) {
  const rows = rowsOf(workbook, 'Lead Faculty');
  const headerIdx = rows.findIndex(r => clean(r[0]) === 'Year' && clean(r[3]).toLowerCase().includes('lead'));
  if (headerIdx < 0) return [];
  const out = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const year = romanOf(r[0]);
    const titleRaw = clean(r[2]);
    if (!year || !titleRaw) continue;
    const title = titleRaw.replace(/\s*\(\s*\d+\s*sections?\s*\)\s*$/i, '').trim();
    if (!title) continue;
    const leadRaw = clean(r[3]);
    out.push({year, courseName: title, leadFacultyRaw: (leadRaw && leadRaw !== '***') ? leadRaw : null});
  }
  return out;
}

// Resolve the sheet's plain-text lead-faculty name to an actual facultyId in
// the merged roster. Exact name match first; falls back to the order/
// abbreviation-tolerant matcher above for names given in a shortened form.
export function resolveLeadFaculty(rawName, facultyPeople) {
  if (!rawName) return null;
  const exact = facultyPeople.find(p => personKey(p.name) === personKey(rawName));
  if (exact) return exact;
  const loose = facultyPeople.filter(p => namesLikelyMatch(p.name, rawName));
  // Prefer whoever is a real, currently-employed Workload-sheet person over a
  // submissions-only entry if more than one name happens to match.
  if (loose.length > 1) loose.sort((a, b) => (b.inWorkloadSheet ? 1 : 0) - (a.inWorkloadSheet ? 1 : 0));
  return loose[0] || null;
}

// The "Prescribed workload (h/week)" column (index 5) sometimes comes through
// as the department's own text ("16-18", or a single number like "12"), but
// Excel silently auto-formats small "M-D"-looking ranges (e.g. "6-8", "12-14")
// as dates. SheetJS then hands that back as a raw date serial number. Both
// forms are decoded here into a real {min,max} - the department's own stated
// number for that specific person, not a guess.
function excelSerialToRange(serial) {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return {min: date.getUTCMonth() + 1, max: date.getUTCDate()};
}
export function parsePrescribedWorkload(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    // A plausible Excel date serial (Excel auto-formatted "M-D" as a date).
    if (raw > 20000 && raw < 60000) return excelSerialToRange(raw);
    return {min: raw, max: raw};
  }
  const s = clean(raw);
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return {min: Number(range[1]), max: Number(range[2])};
  const n = Number(s);
  if (Number.isFinite(n)) return {min: n, max: n};
  return null;
}

// ---------------------------------------------------------------------------
// 2. Faculty who carry a workload
// ---------------------------------------------------------------------------
export function parseWorkloadSheet(workbook) {
  const rows = rowsOf(workbook, 'Faculty WL');
  const faculty = [];
  let cur = null;
  for (const r of rows.slice(7)) {
    if (Number.isFinite(Number(r[0])) && r[0] !== null && clean(r[2])) {
      cur = {
        slNo: Number(r[0]), rawId: String(r[1]).trim(), name: clean(r[2]),
        designationRaw: clean(r[3]), additionalDuties: clean(r[4]),
        prescribed: parsePrescribedWorkload(r[5]), courseRows: []
      };
      faculty.push(cur);
    }
    if (cur && clean(r[8])) {
      cur.courseRows.push({
        program: programOf(r[6]), year: romanOf(r[7]), name: clean(r[8]), code: clean(r[9]),
        hours: Number(r[19])
      });
    }
  }
  return {faculty};
}

// ---------------------------------------------------------------------------
// 3. Submitted preferences
// ---------------------------------------------------------------------------
export function parseSubmissions(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null, raw: true});
  const out = [];
  for (const r of rows.slice(1)) {
    if (!clean(r[0]) || !clean(r[1])) continue;
    out.push({
      rawId: String(r[0]).trim(), name: clean(r[1]), designationRaw: clean(r[2]), mobile: clean(r[3]),
      tokens: [r[4], r[5], r[6], r[7], r[8]].map(clean).filter(t => t && t !== '—' && t !== '-'),
      submittedAt: clean(r[9])
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Preferences for faculty who never submitted the form
//
// No guessing, no random sampling. If a faculty member is in the Workload
// sheet but did not submit ranked preferences, the ONLY thing we know for a
// fact about what they should teach is what the Workload sheet already shows
// them assigned to (see the faculty-building loop in buildDataset below,
// which uses p.taughtCourseIds directly). Nothing is invented.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Put everything together
// ---------------------------------------------------------------------------
export function buildDataset({workloadPath, submissionsPath, academicYear = '2026-27', semester = 'I'}) {
  const wlBook = XLSX.readFile(workloadPath);
  const subBook = XLSX.readFile(submissionsPath);
  const courses = parseCourses(wlBook, {academicYear, semester});
  const wl = parseWorkloadSheet(wlBook).faculty;
  const submissions = parseSubmissions(subBook);

  // ---- Fix duplicated employee numbers in the workload sheet ----
  // (e.g. two different people typed with ID 1201). Re-key the entry whose name
  // matches a submission carrying a different ID.
  const subByName = new Map(submissions.map(s => [personKey(s.name), s]));
  const seenIds = new Map();
  const idFixes = [];
  for (const f of wl) {
    const id = padId(f.rawId);
    if (seenIds.has(id) && seenIds.get(id) !== personKey(f.name)) {
      const match = subByName.get(personKey(f.name));
      if (match && padId(match.rawId) !== id) {
        idFixes.push({name: f.name, from: id, to: padId(match.rawId)});
        f.rawId = match.rawId;
        continue;
      }
    }
    seenIds.set(id, personKey(f.name));
  }

  // ---- Course lookup helpers ----
  const coursesByName = new Map();
  for (const c of courses) {
    const k = normName(c.courseName);
    coursesByName.set(k, [...(coursesByName.get(k) || []), c]);
  }
  const byCourseKey = new Map(courses.map(c => [`${c.program}|${c.year}|${normName(c.courseName)}`, c]));

  // "Item" = one thing a faculty member can prefer. A token like "Ethics" can
  // stand for several courses (III year and IV year), so an item = set of courseIds.
  const itemsByKey = new Map();
  for (const [token, names] of Object.entries(TOKEN_TO_COURSE_NAMES)) {
    let matches = names.flatMap(n => (coursesByName.get(normName(n)) || []).filter(c => c.program === 'B. Tech.'));
    // "DBMS" must mean the mandatory core course, not the 1-section Minors variant.
    if (matches.some(c => c.courseType === 'Mandatory')) matches = matches.filter(c => c.courseType === 'Mandatory');
    const ids = matches.map(c => c.courseId);
    if (ids.length) itemsByKey.set(`tok:${token}`, {key: `tok:${token}`, token, courseIds: ids});
  }
  const itemForCourseId = new Map();
  for (const it of itemsByKey.values()) it.courseIds.forEach(id => itemForCourseId.set(id, it.key));
  // Courses with no token (e.g. M.Tech) can still be a preference for people who teach them.
  for (const c of courses) {
    if (!itemForCourseId.has(c.courseId)) {
      const key = `course:${c.courseId}`;
      itemsByKey.set(key, {key, token: c.shortName || c.courseName, courseIds: [c.courseId]});
      itemForCourseId.set(c.courseId, key);
    }
  }
  const tokenItem = t => itemsByKey.get(`tok:${t}`);

  // ---- Merge the two files by employee number (union roster) ----
  const people = new Map();
  const byPersonKey = new Map(); // personKey(name) -> workload person, for ID-mismatch recovery below
  for (const f of wl) {
    const id = padId(f.rawId);
    const taughtIds = new Set();
    for (const cr of f.courseRows) {
      const c = byCourseKey.get(`${cr.program}|${cr.year}|${normName(cr.name)}`)
        || (coursesByName.get(normName(cr.name)) || []).find(x => x.program === cr.program);
      if (c) taughtIds.add(c.courseId);
    }
    const person = {
      id, name: f.name, designationRaw: f.designationRaw, additionalDuties: f.additionalDuties,
      prescribed: f.prescribed, taughtCourseIds: [...taughtIds], inWorkload: true, submission: null
    };
    people.set(id, person);
    byPersonKey.set(personKey(f.name), person);
  }
  // Faculty who submitted the preference form using an employee number that
  // doesn't match their real Workload-sheet ID (a typo, or their admission /
  // temp ID instead of their employee ID) would otherwise become a phantom
  // duplicate person - a fake profile that can never be assigned any course,
  // while their real profile is wrongly treated as "never submitted". Match
  // by name first so their real submitted preferences reach their real
  // record; only create a new person when no real workload record exists.
  const submissionIdFixes = [];
  for (const s of submissions) {
    const id = padId(s.rawId);
    let p = people.get(id);
    if (!p) {
      const byName = byPersonKey.get(personKey(s.name));
      if (byName && !byName.submission) {
        p = byName;
        submissionIdFixes.push({name: s.name, submittedAs: id, realId: byName.id});
      }
    }
    if (p) p.submission = s;
    else { people.set(id, {id, name: s.name, designationRaw: s.designationRaw, additionalDuties: '', taughtCourseIds: [], inWorkload: false, submission: s}); byPersonKey.set(personKey(s.name), people.get(id)); }
  }

  // ---- Final faculty records ----
  const faculty = [];
  for (const p of people.values()) {
    const d = normalizeDesignation(p.designationRaw, p.prescribed);
    let preferences, source;
    if (p.submission && p.submission.tokens.some(t => tokenItem(t))) {
      // Submitted form: a token like "Ethics" is genuinely ambiguous between
      // years, so every course under that token becomes a ranked preference -
      // this reflects what the person actually wrote on the form.
      source = 'submitted';
      const itemKeys = [];
      for (const t of p.submission.tokens) {
        const it = tokenItem(t);
        if (it && !itemKeys.includes(it.key)) itemKeys.push(it.key);
      }
      preferences = [];
      itemKeys.forEach((k, idx) => {
        for (const courseId of itemsByKey.get(k).courseIds) {
          if (!preferences.some(x => x.courseId === courseId)) preferences.push({courseId, rank: idx + 1});
        }
      });
    } else {
      // No submission: use EXACTLY the course(s) the Workload sheet shows this
      // person teaching - never expand through the token grouping, since that
      // would pull in a same-named course from a different year they don't
      // actually teach.
      const taught = [...new Set(p.taughtCourseIds)];
      source = taught.length ? 'workload' : 'none';
      preferences = taught.map((courseId, idx) => ({courseId, rank: idx + 1}));
    }
    const courseName = id => courses.find(c => c.courseId === id)?.courseName;
    const expertise = [...new Set([...p.taughtCourseIds, ...preferences.map(x => x.courseId)].map(courseName).filter(Boolean))];
    faculty.push({
      facultyId: p.id, employeeNo: p.id, name: p.name, email: '', mobile: p.submission?.mobile || '',
      department: 'CSE', designation: d.designation, designationRaw: p.designationRaw || p.submission?.designationRaw || '',
      priorityTier: d.tier, courseQuota: d.quota, prescribedMin: d.prescribedMin, prescribedMax: d.prescribedMax,
      additionalDuties: p.additionalDuties,
      qualifications: /^(prof\.?\s*)?dr\b/i.test(p.name) ? ['Ph.D.'] : ['M.Tech'],
      specializations: expertise.slice(0, 5), expertise, publications: [],
      maxWorkload: d.prescribedMax, minWorkload: d.prescribedMin, currentWorkload: 0, adminLoadHours: 0,
      previousCourseIds: p.taughtCourseIds,
      preferences, preferenceSource: source,
      submittedAt: p.submission?.submittedAt || '',
      inWorkloadSheet: p.inWorkload, inSubmissionsSheet: !!p.submission,
      availability: [], onLeave: false, status: 'active'
    });
  }
  faculty.sort((a, b) => a.facultyId.localeCompare(b.facultyId));

  // ---- Attach the department's official Lead Faculty (course coordinator)
  // to each course, where it can be confidently resolved to a real person ----
  const leadRows = parseLeadFacultySheet(wlBook);
  const leadByKey = new Map(leadRows.map(l => [`${l.year}|${normName(l.courseName)}`, l]));
  const leadFacultyFixes = [];
  for (const c of courses) {
    const lead = leadByKey.get(`${c.year}|${normName(c.courseName)}`);
    if (!lead || !lead.leadFacultyRaw) continue;
    const person = resolveLeadFaculty(lead.leadFacultyRaw, faculty);
    c.officialLeadFacultyName = lead.leadFacultyRaw;
    c.officialLeadFacultyId = person ? person.facultyId : null;
    if (!person) leadFacultyFixes.push({course: c.courseName, leadFacultyRaw: lead.leadFacultyRaw, resolved: false});
    else if (personKey(person.name) !== personKey(lead.leadFacultyRaw)) leadFacultyFixes.push({course: c.courseName, leadFacultyRaw: lead.leadFacultyRaw, resolved: true, matchedName: person.name, facultyId: person.facultyId});
  }

  const summary = {
    faculty: faculty.length,
    courses: courses.length,
    sections: courses.reduce((n, c) => n + c.sectionCount, 0),
    instructorSlots: courses.reduce((n, c) => n + c.sectionCount * c.instructorsPerSection, 0),
    facultyQuotaTotal: faculty.reduce((n, f) => n + f.courseQuota, 0),
    inBothFiles: faculty.filter(f => f.inWorkloadSheet && f.inSubmissionsSheet).length,
    workloadOnly: faculty.filter(f => f.inWorkloadSheet && !f.inSubmissionsSheet).length,
    submissionsOnly: faculty.filter(f => !f.inWorkloadSheet && f.inSubmissionsSheet).length,
    submittedPreferences: faculty.filter(f => f.preferenceSource === 'submitted').length,
    workloadAssignedPreferences: faculty.filter(f => f.preferenceSource === 'workload').length,
    noPreferenceData: faculty.filter(f => f.preferenceSource === 'none').length,
    byDesignation: faculty.reduce((m, f) => (m[f.designation] = (m[f.designation] || 0) + 1, m), {}),
    idFixes, submissionIdFixes, leadFacultyFixes
  };
  return {faculty, courses, summary};
}
