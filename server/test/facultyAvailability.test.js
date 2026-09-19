// Tests for isFacultyAvailable and the conflictTools.checkAvailability
// wrapper that used to be permanently broken (a `|| true` made it always
// report available, no matter what).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const FACULTY_MODEL_PATH = new URL('../src/models/Faculty.js', import.meta.url).href;

function mockFacultyModel(t, record) {
  t.mock.module(FACULTY_MODEL_PATH, {
    defaultExport: { findOne: () => ({ lean: async () => record }) }
  });
}

test('an active faculty member with no leave flag is available', async (t) => {
  mockFacultyModel(t, { facultyId: 'F1', status: 'active', onLeave: false });
  const { isFacultyAvailable } = await import('../src/tools/facultyTools.js?avail-active');
  const result = await isFacultyAvailable('F1');
  assert.equal(result.available, true);
});

test('a faculty member on leave is unavailable and surfaces the leave reason', async (t) => {
  mockFacultyModel(t, { facultyId: 'F1', status: 'active', onLeave: true, leaveReason: 'Maternity leave' });
  const { isFacultyAvailable } = await import('../src/tools/facultyTools.js?avail-leave');
  const result = await isFacultyAvailable('F1');
  assert.equal(result.available, false);
  assert.equal(result.reason, 'Maternity leave');
});

test('an inactive faculty account is unavailable', async (t) => {
  mockFacultyModel(t, { facultyId: 'F1', status: 'inactive', onLeave: false });
  const { isFacultyAvailable } = await import('../src/tools/facultyTools.js?avail-inactive');
  const result = await isFacultyAvailable('F1');
  assert.equal(result.available, false);
});

test('a nonexistent faculty record is unavailable rather than throwing', async (t) => {
  mockFacultyModel(t, null);
  const { isFacultyAvailable } = await import('../src/tools/facultyTools.js?avail-missing');
  const result = await isFacultyAvailable('ghost');
  assert.equal(result.available, false);
});

test('conflictTools.checkAvailability delegates to isFacultyAvailable instead of always returning true', async (t) => {
  mockFacultyModel(t, { facultyId: 'F1', status: 'active', onLeave: true, leaveReason: 'Sabbatical' });
  const { checkAvailability } = await import('../src/tools/conflictTools.js?checkavail-leave');
  const result = await checkAvailability('F1');
  assert.equal(result.available, false);
});
