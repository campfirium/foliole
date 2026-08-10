import { expect, it } from 'vitest';

import {
  assertTask3Complete, assertTask3Receipt, createTask3Manifest, TASK3_STEPS
} from './t121-task3-contract.mjs';

const counts = { attachments: 3, contentBlobs: 4, missingAttachments: 0,
  missingContentBlobs: 0, nodes: 5 };
const identity = (device, activeMemberCount = 3) => ({ activeMemberCount,
  counts, device, groupId: 'group', localMemberState: 'active', timelineId: 'timeline' });
function manifest() {
  return createTask3Manifest({ baseline: { devices: { A: identity('A', 2), B: identity('B'),
    C: identity('C') }, groupId: 'group', timelineId: 'timeline' }, candidate: { branch: 'dev', clean: true,
    committed: true, revision: 'a'.repeat(40), verifications: [{ status: 'passed' }] } });
}

function receipt(value, step) {
  const evidence = { boundaryDigest: value.boundaryDigest, devices: {
    A: identity('A'), B: identity('B'), C: identity('C') } };
  if (step.endsWith('-fact-converges')) Object.assign(evidence, { factId: `${step}-id`,
    origin: step[0].toUpperCase(), visibleOn: ['A', 'B', 'C'] });
  return { evidence, evidenceRef: `${step}.json`, resultStatus: 'success', step };
}

it('accepts only a current B/C-complete task 2 output baseline', () => {
  expect(() => manifest()).not.toThrow();
  const value = manifest();
  value.baseline.devices.C.counts.missingAttachments = 1;
  expect(() => createTask3Manifest({ baseline: value.baseline, candidate: value.candidate }))
    .toThrow('resources are incomplete');
});

it('proves task 3 without admitting C again or performing Leave', () => {
  const value = manifest();
  for (const step of TASK3_STEPS) assertTask3Receipt(value, step, receipt(value, step));
  expect(assertTask3Complete(value)).toBe(true);
  expect(TASK3_STEPS.join(' ')).not.toMatch(/admit|leave|credential/u);
});

it('rejects fact evidence that is not visible on all three devices', () => {
  const value = manifest();
  assertTask3Receipt(value, TASK3_STEPS[0], receipt(value, TASK3_STEPS[0]));
  assertTask3Receipt(value, TASK3_STEPS[1], receipt(value, TASK3_STEPS[1]));
  const invalid = receipt(value, TASK3_STEPS[2]);
  invalid.evidence.visibleOn = ['A', 'B'];
  expect(() => assertTask3Receipt(value, TASK3_STEPS[2], invalid)).toThrow('visibility');
});
