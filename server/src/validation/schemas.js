import {z} from 'zod';

// ---------------------------------------------------------------------------
// /api/auth
// ---------------------------------------------------------------------------
export const registerBody = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  email: z.string().trim().email('a valid email is required').max(200),
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
  role: z.enum(['faculty', 'hod']).optional().default('faculty'),
  facultyId: z.string().trim().max(64).optional()
}).strict();

export const loginBody = z.object({
  email: z.string().trim().email('a valid email is required').max(200),
  password: z.string().min(1, 'password is required').max(200),
  role: z.enum(['faculty', 'hod']).default('faculty')
}).strict();

// ---------------------------------------------------------------------------
// /api/allocations
// ---------------------------------------------------------------------------
export const mongoIdOrLocalId = z.string().trim().min(1).max(128);

export const idParam = z.object({
  id: mongoIdOrLocalId
}).passthrough(); // Express also supplies other matched params on req.params if present

export const bulkIdsBody = z.object({
  ids: z.array(mongoIdOrLocalId).min(1, 'select at least one allocation')
}).strict();

export const bulkRejectBody = z.object({
  ids: z.array(mongoIdOrLocalId).min(1, 'select at least one allocation'),
  reason: z.string().trim().max(2000).optional()
}).strict();

export const rejectBody = z.object({
  reason: z.string().trim().max(2000).optional().default('')
}).strict();

export const overrideBody = z.object({
  facultyId: z.string().trim().min(1, 'facultyId is required').max(64),
  reason: z.string().trim().max(2000).optional().default('')
}).strict();
