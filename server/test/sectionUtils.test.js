// The client's section helpers must understand the section labels the workload sheet uses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatSection, sectionLabelOf, sectionNumbersOf, sectionNumberOf} from '../../client/src/utils/section.js';

test('plain numbered sections keep the "YSN" label', () => {
  assert.equal(formatSection('III', '24CS306-S07'), '3S7');
  assert.equal(formatSection('I', '25CS101-S26'), '1S26');
  assert.equal(sectionNumberOf('PIC-S01'), '1');
});
test('several sections taught together keep every number', () => {
  assert.equal(sectionLabelOf('24CS305-S12,19,4,7'), '12,19,4,7');
  assert.deepEqual(sectionNumbersOf('24CS305-S12,19,4,7'), [12, 19, 4, 7]);
  assert.equal(formatSection('III', '24CS305-S1,3,18,22'), '3S1,3,18,22');
  assert.equal(sectionNumberOf('24CS305-S1,3,18,22'), '');
});
test('branch batches are shown as the sheet has them', () => {
  assert.equal(formatSection('II', '25CS201-SEEE'), 'EEE');
  assert.equal(formatSection('I', '25CS101-S43-RA'), '43-RA');
  assert.deepEqual(sectionNumbersOf('25CS101-S43-RA'), [43]);
  assert.deepEqual(sectionNumbersOf('25CS201-SFood Tech'), []);
});
test('course ids that themselves contain "-S" still parse', () => {
  assert.equal(sectionLabelOf('NEW-SOMETHING-S07'), '07');
  assert.equal(formatSection('II', ''), '');
});
