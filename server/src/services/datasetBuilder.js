// ============================================================================
// DATASET BUILDER
//
// Turns the two spreadsheets the department maintains into the records the
// application stores in MongoDB:
//   1. Workload_AY_2026-27_I_Sem*.xlsx -> courses, faculty roster and - most
//      importantly - the ASSIGNMENTS: every row of the "Faculty WL" sheet
//      becomes exactly one allocation (same faculty, course, section, hours).
//   2. submissions_YYYY-MM-DD.xlsx     -> ranked course preferences.
//
// Rules implemented here (all in one place so they are easy to change):
//   * Assignments are copied 1:1 from the Faculty WL sheet. Nothing is
//     invented, dropped, merged or re-distributed.
//   * The same person can carry a different employee number in the two files
//     (28 people do). People are matched by employee number AND by name, so
//     nobody ends up duplicated. The Workload sheet's number is the canonical
//     facultyId; the submission-form number is kept as submissionEmployeeNo.
//   * Faculty who submitted preferences keep them (form tokens -> courses).
//     Faculty who did NOT submit get their currently assigned courses as their
//     preferences.
//   * Courses that the Faculty WL sheet uses but "List of Courses" does not
//     list (Digital Logic Design, NPTEL, ...) are added to the catalogue so no
//     assignment is lost. They are flagged catalogSource = 'workload-sheet'
//     or 'load-calculation'.
//   * Designation decides priority tier and course quota. Prescribed weekly
//     hours come from the Workload sheet when it states them.
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
export const normName = v => clean(v).toLowerCase().replace(/&/g, ' and ').replace(/visualisation/g, 'visualization').replace(/[^a-z0-9]+/g, '');
export const personKey = v => clean(v).toLowerCase().replace(/\b(dr|mr|mrs|ms|prof|miss)\b\.?/g, '').replace(/[^a-z]+/g, '');
const romanOf = v => {
  const s = clean(v).toUpperCase();
  if (['I', 'II', 'III', 'IV'].includes(s)) return s;
  return ({1: 'I', 2: 'II', 3: 'III', 4: 'IV'})[Number(s)] || s;
};
const programOf = v => /m\.?\s*tech/i.test(String(v)) ? 'M. Tech.' : 'B. Tech.';
const isPlaceholderCode = c => !c || /to be assigned|new code/i.test(c);
const numOrNull = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
export const padId = v => String(parseInt(String(v).replace(/\D/g, ''), 10)).padStart(5, '0');

// Deterministic PRNG (kept for callers that want reproducible sampling).
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

const sheetOf = (wb, name) => {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" not found in workload workbook`);
  return ws;
};
const rowsOf = (wb, name) => XLSX.utils.sheet_to_json(sheetOf(wb, name), {header: 1, defval: null, raw: true});

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
// 1. "Faculty WL" sheet: one entry per faculty, each with its course rows
// ---------------------------------------------------------------------------
// Prescribed workload cell: Excel stored "6-8" and "12-14" as DATES (8 June /
// 14 December), "16-18" as text and "12" as a number. Turn all of them back
// into [min, max]; null when the cell is empty.
function parsePrescribed(cell) {
  if (!cell || cell.v === null || cell.v === undefined || clean(cell.v) === '') return null;
  let text;
  if (cell.t === 'n' && cell.v > 1000) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    text = `${d.m}-${d.d}`;
  } else text = clean(cell.v);
  let m = text.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) return {min: Number(m[1]), max: Number(m[2]), text: `${m[1]}-${m[2]}`};
  m = text.match(/^\d+$/);
  if (m) return {min: Number(text), max: Number(text), text};
  return null;
}

// A section cell is typed free-hand: "7", "12,19,4,7", "EEE", "25-eee", "Food Tech".
// The label is preserved as typed; sectionNumbers lists the numbered sections it covers.
export function sectionInfo(courseId, cell) {
  const label = clean(cell).replace(/\s*,\s*/g, ',');
  if (!label) return {label: '', sectionId: '', sectionNumbers: []};
  let numbers = [];
  if (/^\d+(,\d+)*$/.test(label)) numbers = label.split(',').map(Number);
  else { const m = label.match(/^(\d+)\s*-/); if (m) numbers = [Number(m[1])]; }
  const sectionId = /^\d+$/.test(label) ? `${courseId}-S${label.padStart(2, '0')}` : `${courseId}-S${label}`;
  return {label, sectionId, sectionNumbers: numbers};
}

export function parseWorkloadSheet(workbook) {
  const ws = sheetOf(workbook, 'Faculty WL');
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null, raw: true});
  const originRow = XLSX.utils.decode_range(ws['!ref']).s.r;
  const headerIdx = rows.findIndex(r => /^sl\.?\s*no/i.test(clean(r[0])));
  if (headerIdx < 0) throw new Error('"Faculty WL" header row (Sl. No.) not found');

  const faculty = [];
  let cur = null;
  for (let i = headerIdx + 2; i < rows.length; i++) {           // +2 skips the two header rows
    const r = rows[i];
    const excelRow = i + 1 + originRow;
    if (r[0] !== null && Number.isFinite(Number(r[0])) && clean(r[2])) {
      cur = {
        slNo: Number(r[0]), rawId: clean(r[1]), name: clean(r[2]), designationRaw: clean(r[3]),
        additionalDuties: clean(r[4]),
        prescribed: parsePrescribed(ws[XLSX.utils.encode_cell({r: i + originRow, c: 5})]),
        sheetTotal: null, comment: '', sheetRow: excelRow, courseRows: []
      };
      faculty.push(cur);
    }
    if (!cur) continue;
    if (numOrNull(r[20]) !== null && cur.sheetTotal === null) cur.sheetTotal = Number(r[20]);
    if (clean(r[21]) && !cur.comment) cur.comment = clean(r[21]);
    if (clean(r[8])) {
      const hours = Number(r[19]);
      if (!Number.isFinite(hours)) throw new Error(`Faculty WL row ${excelRow}: hours/course/week is not a number (${r[19]})`);
      cur.courseRows.push({
        sheetRow: excelRow, program: programOf(r[6]), year: romanOf(r[7]), name: clean(r[8]), code: clean(r[9]),
        L: numOrNull(r[10]), T: numOrNull(r[11]), P: numOrNull(r[12]), C: numOrNull(r[13]),
        sectionCell: r[14], students: numOrNull(r[15]), hours
      });
    }
  }
  return {faculty};
}

// ---------------------------------------------------------------------------
// 2. Course catalogue: "List of Courses" + courses only the other sheets know
// ---------------------------------------------------------------------------
export function buildCatalog(workbook, wlFaculty, {academicYear = '2026-27', semester = 'I'} = {}) {
  const list = rowsOf(workbook, 'List of Courses');
  const headerIdx = list.findIndex(r => clean(r[0]) === 'Program');
  if (headerIdx < 0) throw new Error('"List of Courses" header row not found');
  const loadRows = rowsOf(workbook, 'Load-Calculation');
  const loadHeader = loadRows.findIndex(r => clean(r[0]) === 'Program');

  const entries = [];
  for (const r of list.slice(headerIdx + 1)) {
    if (!clean(r[0]) || !Number.isFinite(Number(r[1]))) continue;      // skips the totals row
    const name = clean(r[4]);
    entries.push({
      source: 'list-of-courses', program: programOf(r[0]), year: romanOf(r[2]), name, nameKey: normName(name),
      listCode: isPlaceholderCode(clean(r[5])) ? '' : clean(r[5]), loadCode: '', short: '', courseType: clean(r[6]),
      L: Number(r[9]) || 0, T: Number(r[10]) || 0, P: Number(r[11]) || 0, credits: Number(r[12]) || 0,
      sectionCount: Number(r[13]) || 0, strength: Number(r[14]) || 0
    });
  }
  const keyOf = e => `${e.program}|${e.year}|${e.nameKey}`;
  const byKey = new Map(entries.map(e => [keyOf(e), e]));
  // Load-Calculation: time-table short names + codes; also lists courses that
  // "List of Courses" forgot (Digital Logic Design).
  for (const r of loadRows.slice(loadHeader + 1)) {
    if (!clean(r[0]) || !Number.isFinite(Number(r[1]))) continue;
    const name = clean(r[4]);
    const probe = {program: programOf(r[0]), year: romanOf(r[2]), nameKey: normName(name)};
    const code = isPlaceholderCode(clean(r[6])) ? '' : clean(r[6]);
    let e = byKey.get(keyOf(probe));
    if (!e) {
      e = {
        source: 'load-calculation', program: probe.program, year: probe.year, name, nameKey: probe.nameKey,
        listCode: '', loadCode: '', short: '', courseType: clean(r[7]),
        L: Number(r[8]) || 0, T: Number(r[9]) || 0, P: Number(r[10]) || 0, credits: Number(r[11]) || 0,
        sectionCount: Number(r[12]) || 0, strength: parseInt(String(r[13]), 10) || 0
      };
      entries.push(e); byKey.set(keyOf(e), e);
    }
    e.short = clean(r[5]); e.loadCode = code;
  }

  // Resolve every Faculty WL course row to a catalogue entry.
  const resolveEntry = row => {
    const nameKey = normName(row.name);
    const exact = byKey.get(`${row.program}|${row.year}|${nameKey}`);
    if (exact) return exact;
    // The sheet types the year inconsistently ("Data Structures" tagged year I,
    // "MLOps" tagged year III). Fall back to the same course name in the same program.
    const sameName = entries.filter(x => x.program === row.program && x.nameKey === nameKey);
    if (sameName.length === 1) return sameName[0];
    if (sameName.length > 1) {
      const byCode = sameName.filter(x => x.listCode && x.listCode === row.code);
      if (byCode.length === 1) return byCode[0];
      throw new Error(`Faculty WL row ${row.sheetRow}: "${row.name}" (${row.code}) matches several courses; cannot pick one safely`);
    }
    // Renamed course with an unchanged code (M.Tech "Data Structures" = "Data Structures and Algorithms").
    if (!isPlaceholderCode(row.code)) {
      const byCode = entries.filter(x => x.program === row.program && (x.listCode === row.code || x.loadCode === row.code));
      if (byCode.length === 1) return byCode[0];
    }
    return null;
  };

  const resolved = new Map();      // row object -> entry
  for (const f of wlFaculty) for (const row of f.courseRows) {
    let e = resolveEntry(row);
    if (!e) {
      // Not in any catalogue sheet: add it so the assignment is not lost.
      e = {
        source: 'workload-sheet', program: row.program, year: row.year, name: row.name, nameKey: normName(row.name),
        listCode: '', loadCode: '', short: '', courseType: 'Other (from workload sheet)',
        L: row.L || 0, T: row.T || 0, P: row.P || 0, credits: row.C || 0, sectionCount: 0, strength: 0
      };
      entries.push(e);
      byKey.set(keyOf(e), e);
    }
    resolved.set(row, e);
  }

  // Gather what the workload sheet shows per entry (codes, hours, section numbers).
  const usage = new Map(entries.map(e => [e, {codes: [], hours: [], sectionNums: new Set()}]));
  for (const [row, e] of resolved) {
    const u = usage.get(e);
    if (!isPlaceholderCode(row.code)) u.codes.push(row.code);
    if (row.hours > 0) u.hours.push(row.hours);
    sectionInfo('x', row.sectionCell).sectionNumbers.forEach(n => u.sectionNums.add(n));
  }
  const mode = arr => {
    const m = new Map(); arr.forEach(x => m.set(x, (m.get(x) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || (typeof a[0] === 'number' ? b[0] - a[0] : String(a[0]).localeCompare(String(b[0]))))[0];
  };

  const courses = [];
  const usedIds = new Set();
  const entryToId = new Map();
  for (const e of entries) {
    const u = usage.get(e);
    let code = e.listCode || e.loadCode || (u.codes.length ? mode(u.codes)[0] : '');
    if (!code) {
      const initials = e.name.split(/\s+/).filter(w => !/^(and|of|the|in|for)$/i.test(w)).map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
      code = `NEW-${initials || e.nameKey.slice(0, 8).toUpperCase()}`;
    }
    let courseId = code;
    if (usedIds.has(courseId)) courseId = `${code}-${e.year}${e.program === 'M. Tech.' ? 'PG' : ''}`;
    usedIds.add(courseId);
    entryToId.set(e, courseId);

    // Hours a faculty member spends on ONE section per week: what the sheet shows, else L+T+P.
    const ltp = e.L + e.T + e.P;
    let hoursPerSection = ltp;
    if (u.hours.length >= 3) {
      const [m] = mode(u.hours);
      if (m >= ltp - 2 && m <= ltp + 3) hoursPerSection = m;
    } else if (e.source !== 'list-of-courses' && u.hours.length) hoursPerSection = mode(u.hours)[0];
    const sectionCount = e.sectionCount || u.sectionNums.size || 0;
    // Real workload sheets show ~1.3 faculty rows per section: a theory (lead)
    // instructor plus a co-instructor for the tutorial / practical batches.
    const instructorsPerSection = (e.L > 0 && (e.T + e.P) > 0) ? 2 : 1;
    const sections = Array.from({length: sectionCount}, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {sectionId: `${courseId}-S${n}`, sectionName: `S${n}`, hoursPerWeek: hoursPerSection, instructorSlots: instructorsPerSection};
    });
    courses.push({
      courseId, courseCode: courseId, courseName: e.name, shortName: e.short || '',
      department: 'CSE', academicYear, semester,
      program: e.program, year: e.year, courseType: e.courseType,
      credits: e.credits, theoryHours: e.L, tutorialHours: e.T, labHours: e.P,
      hoursPerSection, sectionCount, instructorsPerSection, sections,
      studentStrength: e.strength,
      requiredExpertise: [e.name], requiredQualification: [],
      catalogSource: e.source, status: 'open'
    });
  }
  const courseIdOfRow = row => entryToId.get(resolved.get(row));
  return {courses, courseIdOfRow};
}

// Back-compat helper: the course list only.
export function parseCourses(workbook, opts) {
  return buildCatalog(workbook, parseWorkloadSheet(workbook).faculty, opts).courses;
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
// 4. Put everything together
// ---------------------------------------------------------------------------
export function buildDataset({workloadPath, submissionsPath, academicYear = '2026-27', semester = 'I', allocationStatus = 'approved'}) {
  const wlBook = XLSX.readFile(workloadPath);
  const subBook = XLSX.readFile(submissionsPath);
  const wl = parseWorkloadSheet(wlBook).faculty;
  const {courses, courseIdOfRow} = buildCatalog(wlBook, wl, {academicYear, semester});
  const submissions = parseSubmissions(subBook);
  const warnings = [];

  // ---- match the two files person by person ----
  const subByKey = new Map();
  for (const s of submissions) {
    const k = personKey(s.name);
    if (subByKey.has(k)) throw new Error(`Submissions sheet: "${s.name}" appears twice`);
    subByKey.set(k, s);
  }
  const subById = new Map(submissions.map(s => [padId(s.rawId), s]));
  const usedSubs = new Set();
  const matches = new Map();                    // wl faculty -> submission
  for (const f of wl) {
    let s = subByKey.get(personKey(f.name)) || null;          // same person (name), whatever the number
    if (!s) {
      const byId = subById.get(padId(f.rawId));
      if (byId && !usedSubs.has(byId)) warnings.push(`Employee number ${padId(f.rawId)} is "${f.name}" in the workload sheet but "${byId.name}" in the submissions sheet - NOT treated as the same person`);
    }
    if (s && usedSubs.has(s)) throw new Error(`Submission "${s.name}" matches two workload rows`);
    if (s) { usedSubs.add(s); matches.set(f, s); }
  }

  // ---- canonical employee numbers (the workload sheet is authoritative) ----
  const idOf = new Map();
  const idFixes = [];
  const seen = new Map();
  for (const f of wl) {
    let id = padId(f.rawId);
    const s = matches.get(f);
    if (seen.has(id)) {
      // Two different people typed with the same number (1201). The one who also
      // filed a submission keeps the number from that submission.
      if (s && padId(s.rawId) !== id) { idFixes.push({name: f.name, from: id, to: padId(s.rawId)}); id = padId(s.rawId); }
      else throw new Error(`Duplicate employee number ${id} in the workload sheet ("${f.name}") that cannot be repaired`);
    }
    seen.set(id, f.name);
    idOf.set(f, id);
  }
  const wlPeople = wl.map(f => ({f, id: idOf.get(f), sub: matches.get(f) || null}));
  const subOnly = submissions.filter(s => !usedSubs.has(s)).map(s => ({f: null, id: padId(s.rawId), sub: s}));
  for (const p of subOnly) if (seen.has(p.id)) throw new Error(`Submission "${p.sub.name}" uses employee number ${p.id}, already taken by "${seen.get(p.id)}"`);
  const people = [...wlPeople, ...subOnly];

  // ---- course lookup for preference tokens ----
  const coursesByName = new Map();
  for (const c of courses) { const k = normName(c.courseName); coursesByName.set(k, [...(coursesByName.get(k) || []), c]); }
  const itemsByKey = new Map();
  for (const [token, names] of Object.entries(TOKEN_TO_COURSE_NAMES)) {
    let matchesForToken = names.flatMap(n => (coursesByName.get(normName(n)) || []).filter(c => c.program === 'B. Tech.'));
    // "DBMS" must mean the mandatory core course, not the 1-section Minors variant.
    if (matchesForToken.some(c => c.courseType === 'Mandatory')) matchesForToken = matchesForToken.filter(c => c.courseType === 'Mandatory');
    const ids = matchesForToken.map(c => c.courseId);
    if (ids.length) itemsByKey.set(token, ids);
  }
  const unknownTokens = new Set();
  const courseById = new Map(courses.map(c => [c.courseId, c]));

  // ---- faculty + allocations ----
  const faculty = [];
  const allocations = [];
  const sheetTotalMismatches = [];
  const codeNotes = new Map(), yearNotes = new Map();        // aggregated instead of one warning per row
  const bump = (map, key, row) => { const v = map.get(key) || {count: 0, rows: []}; v.count++; v.rows.push(row); map.set(key, v); };
  for (const p of people) {
    const rows = p.f ? p.f.courseRows : [];
    const assigned = rows.map(row => ({row, courseId: courseIdOfRow(row)}));
    const taughtIds = [...new Set(assigned.map(a => a.courseId))];      // distinct, in sheet order
    const designationRaw = p.f?.designationRaw || p.sub?.designationRaw || '';
    const d = normalizeDesignation(designationRaw);
    const prescribed = p.f?.prescribed || null;
    const pMin = prescribed ? prescribed.min : d.prescribedMin;
    const pMax = prescribed ? prescribed.max : d.prescribedMax;

    let preferences, source;
    const known = p.sub ? p.sub.tokens.filter(t => { if (itemsByKey.has(t)) return true; unknownTokens.add(t); return false; }) : [];
    if (known.length) {
      // Submitted form. A token like "Ethics" is genuinely ambiguous between
      // years, so every course under that token becomes a ranked preference.
      source = 'submitted';
      const tokens = [...new Set(known)];
      preferences = [];
      tokens.forEach((t, idx) => {
        for (const courseId of itemsByKey.get(t)) if (!preferences.some(x => x.courseId === courseId)) preferences.push({courseId, rank: idx + 1});
      });
    } else {
      // No (usable) submission: the current assignment from the workload sheet IS the preference.
      source = taughtIds.length ? 'workload' : 'none';
      preferences = taughtIds.map((courseId, idx) => ({courseId, rank: idx + 1}));
    }
    const rankOf = new Map(preferences.map(x => [x.courseId, x.rank]));

    let hours = 0;
    for (const {row, courseId} of assigned) {
      const course = courseById.get(courseId);
      const sec = sectionInfo(courseId, row.sectionCell);
      hours += row.hours;
      allocations.push({
        facultyId: p.id, facultyName: p.f.name, designation: d.designation, priorityTier: d.tier,
        courseId, courseName: course.courseName, courseYear: course.year,
        sectionId: sec.sectionId, sectionLabel: sec.label, sectionNumbers: sec.sectionNumbers,
        students: row.students, hours: row.hours, status: allocationStatus,
        academicYear, semester, preferenceRank: rankOf.get(courseId) ?? null,
        source: 'workload-sheet', sheetRow: row.sheetRow, sheetProgram: row.program, sheetYear: row.year,
        sheetCourseName: row.name, sheetCourseCode: row.code,
        recommendationReason: `Assigned in the Faculty WL sheet (row ${row.sheetRow}): ${row.name}${sec.label ? `, section ${sec.label}` : ''}, ${row.hours} h/week.`
      });
      if (row.code && !isPlaceholderCode(row.code) && row.code !== courseId) bump(codeNotes, `${course.courseName}: sheet code ${row.code} -> catalogue code ${courseId}`, row.sheetRow);
      if (row.year !== course.year || row.program !== course.program) bump(yearNotes, `${course.courseName}: sheet says ${row.program} year ${row.year}, catalogue has ${course.program} year ${course.year}`, row.sheetRow);
    }
    if (p.f && p.f.sheetTotal !== null && p.f.sheetTotal !== hours) {
      sheetTotalMismatches.push({facultyId: p.id, name: p.f.name, sheetRow: p.f.sheetRow, sheetTotal: p.f.sheetTotal, sumOfRows: hours});
    }
    const courseName = id => courseById.get(id)?.courseName;
    const expertise = [...new Set([...taughtIds, ...preferences.map(x => x.courseId)].map(courseName).filter(Boolean))];
    const name = p.f ? p.f.name : p.sub.name;
    faculty.push({
      facultyId: p.id, employeeNo: p.id, name, email: '', mobile: p.sub?.mobile || '',
      department: 'CSE', designation: d.designation, designationRaw,
      priorityTier: d.tier, courseQuota: d.quota, prescribedMin: pMin, prescribedMax: pMax,
      additionalDuties: p.f?.additionalDuties || '',
      qualifications: /^(prof\.?\s*)?dr\b/i.test(name) ? ['Ph.D.'] : ['M.Tech'],
      specializations: expertise.slice(0, 5), expertise, publications: [],
      maxWorkload: pMax, minWorkload: pMin, currentWorkload: hours, adminLoadHours: 0,
      previousCourseIds: taughtIds,
      preferences, preferenceSource: source,
      submittedAt: p.sub?.submittedAt || '',
      inWorkloadSheet: !!p.f, inSubmissionsSheet: !!p.sub,
      submissionEmployeeNo: p.sub ? padId(p.sub.rawId) : '',
      sheetSlNo: p.f?.slNo ?? null, sheetRow: p.f?.sheetRow ?? null,
      sheetPrescribed: prescribed ? prescribed.text : '', sheetWorkload: p.f ? p.f.sheetTotal : null,
      sheetComment: p.f?.comment || '',
      availability: [], onLeave: false, status: 'active'
    });
  }
  faculty.sort((a, b) => a.facultyId.localeCompare(b.facultyId));
  allocations.sort((a, b) => a.facultyId.localeCompare(b.facultyId) || a.sheetRow - b.sheetRow);
  for (const t of sheetTotalMismatches) warnings.push(`${t.name} (Faculty WL row ${t.sheetRow}): the sheet states a total of ${t.sheetTotal} h/week but its course rows add up to ${t.sumOfRows} h - the application shows the row sum`);
  for (const [k, v] of codeNotes) warnings.push(`Course code differs on ${v.count} Faculty WL row(s) - ${k} (rows ${v.rows.join(', ')})`);
  for (const [k, v] of yearNotes) warnings.push(`Year/program tag differs on ${v.count} Faculty WL row(s) - ${k} (rows ${v.rows.join(', ')}); assigned to the catalogue course`);
  for (const t of unknownTokens) warnings.push(`Unknown preference token "${t}" in the submissions sheet was ignored`);

  const summary = {
    faculty: faculty.length,
    courses: courses.length,
    coursesAddedBeyondCourseList: courses.filter(c => c.catalogSource !== 'list-of-courses').map(c => `${c.courseId} ${c.courseName} (${c.program} ${c.year})`),
    allocations: allocations.length,
    facultyWithAssignments: new Set(allocations.map(a => a.facultyId)).size,
    facultyWithoutAssignments: faculty.filter(f => !allocations.some(a => a.facultyId === f.facultyId)).map(f => `${f.facultyId} ${f.name}`),
    totalAssignedHours: allocations.reduce((n, a) => n + a.hours, 0),
    sections: courses.reduce((n, c) => n + c.sectionCount, 0),
    instructorSlots: courses.reduce((n, c) => n + c.sectionCount * c.instructorsPerSection, 0),
    inBothFiles: faculty.filter(f => f.inWorkloadSheet && f.inSubmissionsSheet).length,
    matchedByNameWithDifferentEmployeeNo: faculty.filter(f => f.submissionEmployeeNo && f.submissionEmployeeNo !== f.facultyId).length,
    workloadOnly: faculty.filter(f => f.inWorkloadSheet && !f.inSubmissionsSheet).length,
    submissionsOnly: faculty.filter(f => !f.inWorkloadSheet && f.inSubmissionsSheet).length,
    submittedPreferences: faculty.filter(f => f.preferenceSource === 'submitted').length,
    workloadAssignedPreferences: faculty.filter(f => f.preferenceSource === 'workload').length,
    noPreferenceData: faculty.filter(f => f.preferenceSource === 'none').length,
    byDesignation: faculty.reduce((m, f) => (m[f.designation] = (m[f.designation] || 0) + 1, m), {}),
    idFixes, sheetTotalMismatches
  };
  return {faculty, courses, allocations, summary, warnings};
}
