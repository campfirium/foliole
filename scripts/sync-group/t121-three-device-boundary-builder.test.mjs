import { expect, it } from 'vitest';

import { buildThreeDeviceJourneyManifest } from './t121-three-device-boundary-builder.mjs';

const candidate = { branch: 'dev', clean: true, committed: true, revision: 'a'.repeat(40),
  treeDigest: 'tree', verifications: [{ status: 'passed' }] };

function input() {
  return { baselineInspection: { android: { inspection: { activeSyncGroupMemberCount: 2,
    syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1' }, integrity: 'ok' },
  identity: { groupId: 'group-1', timelineId: 'timeline-1' } }, candidate,
  cReset: { emptyFacts: { activeMemberCount: 0, attachmentCount: 0, contentBlobCount: 0,
    integrity: 'ok', localGroupId: null, userNodeCount: 0 } } };
}

it('builds the A+B/empty C boundary only from current device facts', () => {
  const manifest = buildThreeDeviceJourneyManifest(input());
  expect(manifest).toMatchObject({ baseline: { devices: {
    A: { activeMemberCount: 2, groupId: 'group-1' },
    B: { activeMemberCount: 2, groupId: 'group-1' },
    C: { activeMemberCount: 0, groupId: null, userNodeCount: 0 }
  }, groupId: 'group-1' }, phase: 'journey' });
  expect(JSON.stringify(manifest)).not.toMatch(/backup|protect|restorePoint/u);
});

it('rejects mismatched Android identity or a non-empty C test workspace', () => {
  const mismatched = input();
  mismatched.baselineInspection.android.inspection.syncGroupId = 'other';
  expect(() => buildThreeDeviceJourneyManifest(mismatched)).toThrow('do not match');
  const nonEmpty = input();
  nonEmpty.cReset.emptyFacts.userNodeCount = 1;
  expect(() => buildThreeDeviceJourneyManifest(nonEmpty)).toThrow('empty product state');
});
