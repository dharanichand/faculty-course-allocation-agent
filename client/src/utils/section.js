// Shared helpers for turning a course's academic year + a raw section id
// (e.g. "PIC-S01") into the unambiguous "YSN" label used across the app
// (Y = year number, S = literal, N = section number) e.g. "2S3" = Year 2, Section 3.
export const ROMAN_TO_NUM = {I: '1', II: '2', III: '3', IV: '4'};

// Extracts the numeric section number from a raw sectionId/sectionName like
// "PIC-S01", "S01" or "S1" -> "1".
export function sectionNumberOf(sectionIdOrName) {
  const m = String(sectionIdOrName || '').match(/S0*([0-9]+)\s*$/i);
  return m ? String(Number(m[1])) : '';
}

// year: roman numeral ("I","II","III","IV") or already-numeric string/program label.
export function yearNumberOf(year) {
  return ROMAN_TO_NUM[year] || (/^[0-9]+$/.test(String(year || '')) ? String(year) : '');
}

// Builds the "YSN" label. Falls back to the raw sectionId/sectionName if the
// year or section number can't be determined, so nothing ever renders blank.
export function formatSection(year, sectionIdOrName) {
  if (!sectionIdOrName) return '';
  const y = yearNumberOf(year);
  const n = sectionNumberOf(sectionIdOrName);
  if (!y || !n) return sectionIdOrName;
  return `${y}S${n}`;
}
