// Shared helpers for turning a course's academic year + a raw section id
// into the unambiguous "YSN" label used across the app
// (Y = year number, S = literal, N = section number) e.g. "2S3" = Year 2, Section 3.
//
// Section ids are `<courseId>-S<label>`. The label is what the workload sheet
// says, so besides plain numbers ("07") it can be several sections taught
// together ("12,19,4,7") or a branch-specific batch ("EEE", "25-eee").
export const ROMAN_TO_NUM = {I: '1', II: '2', III: '3', IV: '4'};

// "PIC-S01" -> "01"   "24CS306-S12,19,4,7" -> "12,19,4,7"   "25CS201-SEEE" -> "EEE"   "S3" -> "3"
export function sectionLabelOf(sectionIdOrName) {
  const s = String(sectionIdOrName || '').trim();
  const m = s.match(/^.*-S(.+)$/) || s.match(/^S(.+)$/i);
  return m ? m[1].trim() : '';
}

// Every numbered section a section id covers: "24CS306-S12,19,4,7" -> [12,19,4,7]; "X-S25-eee" -> [25]; "X-SEEE" -> [].
export function sectionNumbersOf(sectionIdOrName) {
  const label = sectionLabelOf(sectionIdOrName);
  if (/^\d+(\s*,\s*\d+)*$/.test(label)) return label.split(',').map(x => Number(x));
  const m = label.match(/^(\d+)\s*-/);
  return m ? [Number(m[1])] : [];
}

// The single section number of a plain id like "PIC-S01" / "S01" / "S1" -> "1" ('' when it is not a single section).
export function sectionNumberOf(sectionIdOrName) {
  const n = sectionNumbersOf(sectionIdOrName);
  return n.length === 1 ? String(n[0]) : '';
}

// year: roman numeral ("I","II","III","IV") or already-numeric string/program label.
export function yearNumberOf(year) {
  return ROMAN_TO_NUM[year] || (/^[0-9]+$/.test(String(year || '')) ? String(year) : '');
}

// Builds the "YSN" label ("3S7", "3S12,19,4,7"). Branch-specific labels ("EEE",
// "43-RA") are shown exactly as the sheet has them. Falls back to the raw
// sectionId so nothing ever renders blank.
export function formatSection(year, sectionIdOrName) {
  if (!sectionIdOrName) return '';
  const label = sectionLabelOf(sectionIdOrName);
  if (!label) return sectionIdOrName;
  const y = yearNumberOf(year);
  if (/^\d+(\s*,\s*\d+)*$/.test(label)) {
    const clean = label.split(',').map(x => String(Number(x))).join(',');
    return y ? `${y}S${clean}` : clean;
  }
  return label;
}
