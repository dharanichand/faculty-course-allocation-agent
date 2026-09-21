// ============================================================================
// DATASET VERIFIER
//
// Proves that the allocations the application holds are EXACTLY the
// assignments printed in the "Faculty WL" sheet. It deliberately does not reuse
// the importer's parser: it reads the worksheet cell by cell (A..V) and
// compares every row, one-to-one, in both directions:
//   * every course row in the sheet has exactly one allocation (by Excel row),
//   * every allocation points back at a real sheet row (nothing invented),
//   * faculty, course, section, students and hours all agree,
//   * each faculty member's stored workload equals the sum of their rows.
// Used by the import script (against the freshly built data AND against what
// was read back from MongoDB) and by the test-suite.
// ============================================================================
import XLSX from 'xlsx';

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const nk = v => clean(v).toLowerCase().replace(/&/g, ' and ').replace(/visualisation/g, 'visualization').replace(/[^a-z0-9]+/g, '');
const sectionKey = v => clean(v).replace(/\s*,\s*/g, ',');

export function readSheetRows(workloadPath) {
  const wb = XLSX.readFile(workloadPath);
  const ws = wb.Sheets['Faculty WL'];
  if (!ws) throw new Error('Faculty WL sheet not found');
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cell = (r, c) => { const x = ws[XLSX.utils.encode_cell({r: r - 1, c})]; return x ? x.v : null; };
  const rows = [];
  let cur = null;
  for (let r = 8; r <= range.e.r + 1; r++) {            // data starts on Excel row 8
    const sl = cell(r, 0), name = clean(cell(r, 2));
    if (sl !== null && sl !== '' && Number.isFinite(Number(sl)) && name) cur = {sl: Number(sl), name, empId: clean(cell(r, 1))};
    if (cur && clean(cell(r, 8))) {
      rows.push({
        sheetRow: r, sl: cur.sl, facultyName: cur.name, courseName: clean(cell(r, 8)), courseCode: clean(cell(r, 9)),
        section: sectionKey(cell(r, 14)), students: cell(r, 15) === null ? null : Number(cell(r, 15)), hours: Number(cell(r, 19))
      });
    }
  }
  return rows;
}

// allocations: [{facultyId, facultyName, courseId, sectionLabel, students, hours, sheetRow, sheetCourseName}]
// faculty:     [{facultyId, name, currentWorkload?, sheetSlNo?}]   courses: [{courseId, courseName, courseCode}]
export function verifyAllocations({workloadPath, allocations, faculty = [], courses = []}) {
  const problems = [];
  const notes = [];
  const sheet = readSheetRows(workloadPath);
  const bySheetRow = new Map();
  for (const a of allocations) {
    if (bySheetRow.has(a.sheetRow)) problems.push(`Two allocations claim Faculty WL row ${a.sheetRow}`);
    bySheetRow.set(a.sheetRow, a);
  }
  const courseById = new Map(courses.map(c => [c.courseId, c]));
  const facultyBySl = new Map();

  for (const s of sheet) {
    const a = bySheetRow.get(s.sheetRow);
    if (!a) { problems.push(`Faculty WL row ${s.sheetRow} (${s.facultyName}, ${s.courseName}) has no allocation`); continue; }
    const where = `row ${s.sheetRow} (${s.facultyName}, ${s.courseName}, section ${s.section})`;
    if (clean(a.facultyName) !== s.facultyName) problems.push(`${where}: faculty name is "${a.facultyName}"`);
    if (facultyBySl.has(s.sl) && facultyBySl.get(s.sl) !== a.facultyId) problems.push(`${where}: Sl.No ${s.sl} is split over two faculty ids`);
    facultyBySl.set(s.sl, a.facultyId);
    if (Number(a.hours) !== s.hours) problems.push(`${where}: hours ${a.hours} != sheet ${s.hours}`);
    if (sectionKey(a.sectionLabel) !== s.section) problems.push(`${where}: section "${a.sectionLabel}" != sheet "${s.section}"`);
    if ((a.students ?? null) !== s.students) problems.push(`${where}: students ${a.students} != sheet ${s.students}`);
    if (clean(a.sheetCourseName) !== s.courseName) problems.push(`${where}: stored sheet course name "${a.sheetCourseName}"`);
    if (courses.length) {
      const c = courseById.get(a.courseId);
      if (!c) problems.push(`${where}: course ${a.courseId} does not exist`);
      else if (nk(c.courseName) !== nk(s.courseName)) {
        if (s.courseCode && (c.courseCode === s.courseCode)) notes.push(`${where}: sheet calls it "${s.courseName}", catalogue "${c.courseName}" (same code ${s.courseCode})`);
        else problems.push(`${where}: shown as "${c.courseName}" but the sheet says "${s.courseName}"`);
      }
    }
  }
  const sheetRows = new Set(sheet.map(s => s.sheetRow));
  for (const a of allocations) if (!sheetRows.has(a.sheetRow)) problems.push(`Allocation for ${a.facultyName} / ${a.courseId} points at Faculty WL row ${a.sheetRow}, which is not a course row`);

  const hoursByFaculty = new Map();
  for (const a of allocations) hoursByFaculty.set(a.facultyId, (hoursByFaculty.get(a.facultyId) || 0) + Number(a.hours));
  for (const f of faculty) {
    if (f.currentWorkload !== undefined && f.currentWorkload !== null && (hoursByFaculty.get(f.facultyId) || 0) !== Number(f.currentWorkload)) {
      problems.push(`${f.name} (${f.facultyId}): stored workload ${f.currentWorkload} h != sum of allocations ${hoursByFaculty.get(f.facultyId) || 0} h`);
    }
  }
  return {
    ok: problems.length === 0, problems, notes,
    sheetRows: sheet.length, allocations: allocations.length,
    sheetHours: sheet.reduce((n, s) => n + s.hours, 0), allocationHours: allocations.reduce((n, a) => n + Number(a.hours), 0),
    facultyWithRows: facultyBySl.size
  };
}
