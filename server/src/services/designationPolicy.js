// Designation -> priority tier, course quota and prescribed weekly hours.
// Kept free of heavy imports so routes, the allocator and the dataset builder can all share it.
// Edit here to change quotas / priority / hours.
export const TIER_LABELS = {1: 'Professor', 2: 'Associate Professor', 3: 'Assistant Professor', 4: 'Other faculty'};
export const QUOTA_BY_TIER = {1: 1, 2: 2, 3: 3, 4: 3};             // courses per faculty
export const HOURS_BY_TIER = {1: [6, 8], 2: [12, 14], 3: [16, 18], 4: [16, 18]}; // prescribed h/week [min,max]

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
  return {designation, tier, quota: QUOTA_BY_TIER[tier], prescribedMin: HOURS_BY_TIER[tier][0], prescribedMax: HOURS_BY_TIER[tier][1]};
}

