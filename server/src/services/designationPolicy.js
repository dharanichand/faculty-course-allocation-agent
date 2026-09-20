// Designation -> priority tier, course quota and prescribed weekly hours.
// Kept free of heavy imports so routes, the allocator and the dataset builder can all share it.
// Edit here to change quotas / priority / hours.
export const TIER_LABELS = {1: 'Professor', 2: 'Associate Professor', 3: 'Assistant Professor', 4: 'Other faculty', 5: 'Contract Faculty (Limited Load)'};
export const QUOTA_BY_TIER = {1: 1, 2: 2, 3: 3, 4: 3, 5: 2};             // courses per faculty
export const HOURS_BY_TIER = {1: [6, 8], 2: [12, 14], 3: [16, 18], 4: [16, 18], 5: [10, 12]}; // prescribed h/week [min,max]

export function normalizeDesignation(raw, prescribed) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  let designation = 'Other';
  if (/teaching\s*assoc/.test(s)) designation = 'Teaching Associate';
  // "CAP" carries its own, much lower prescribed workload in the Faculty WL
  // sheet (12h/week, vs 16-18h for Assistant Professor) - the sheet has no
  // legend explaining the acronym, so it's kept as its own real tier with a
  // clear name and a quota (2 courses) sized to what 12h/week can actually
  // hold, instead of being lumped in with Assistant Professor's 3-course
  // quota (which was silently overloading these people to 16-18h/week).
  else if (/^cap\b/.test(s) || /contract academic/.test(s)) designation = 'Contract Faculty (Limited Load)';
  else if (/assoc/.test(s) && /prof/.test(s)) designation = 'Associate Professor';
  else if (/(asst|assistant)/.test(s) && /prof/.test(s)) designation = /contract/.test(s) ? 'Assistant Professor (Contract)' : 'Assistant Professor';
  else if (/prof/.test(s)) designation = 'Professor';
  else if (s) designation = String(raw).replace(/\s+/g, ' ').trim();
  const tier = designation === 'Professor' ? 1
    : designation === 'Associate Professor' ? 2
    : designation.startsWith('Assistant Professor') ? 3
    : designation === 'Contract Faculty (Limited Load)' ? 5
    : 4;
  // Prefer the department's own stated prescribed hours for this specific
  // person (from the "Prescribed workload (h/week)" column); only fall back
  // to the tier default when that cell was blank.
  const [defMin, defMax] = HOURS_BY_TIER[tier];
  const prescribedMin = prescribed?.min ?? defMin;
  const prescribedMax = prescribed?.max ?? defMax;
  return {designation, tier, quota: QUOTA_BY_TIER[tier], prescribedMin, prescribedMax};
}

