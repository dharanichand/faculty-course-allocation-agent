// Designation -> priority tier, course quota and prescribed weekly hours.
// Kept free of heavy imports so routes, the allocator and the dataset builder can all share it.
// Edit here to change quotas / priority / hours.
export const TIER_LABELS = {1: 'Professor', 2: 'Associate Professor', 3: 'Assistant Professor', 4: 'Other faculty'};
export const QUOTA_BY_TIER = {1: 1, 2: 2, 3: 3, 4: 3};             // courses per faculty
export const HOURS_BY_TIER = {1: [6, 8], 2: [12, 14], 3: [16, 18], 4: [16, 18]}; // prescribed h/week [min,max]
// The 2026-27 workload sheet prescribes a fixed 12 h/week for CAP (7 of the 9 CAPs that
// state a value), so a CAP with no stated value defaults to 12 instead of the tier's 16-18.
export const HOURS_BY_DESIGNATION = {CAP: [12, 12]};

export function normalizeDesignation(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  let designation = 'Other';
  if (/teaching\s*assoc/.test(s)) designation = 'Teaching Associate';
  else if (/^cap\b/.test(s) || /contract academic/.test(s)) designation = 'CAP';
  else if (/assoc/.test(s) && /prof/.test(s)) designation = 'Associate Professor';
  else if (/(asst|assistant)/.test(s) && /prof/.test(s)) designation = /contract/.test(s) ? 'Assistant Professor (Contract)' : 'Assistant Professor';
  else if (/prof/.test(s)) designation = 'Professor';
  else if (s) designation = String(raw).replace(/\s+/g, ' ').trim();
  const tier = designation === 'Professor' ? 1
    : designation === 'Associate Professor' ? 2
    : designation.startsWith('Assistant Professor') ? 3 : 4;
  const [hMin, hMax] = HOURS_BY_DESIGNATION[designation] || HOURS_BY_TIER[tier];
  return {designation, tier, quota: QUOTA_BY_TIER[tier], prescribedMin: hMin, prescribedMax: hMax};
}

