import { expect, it } from 'vitest';

import { buildThreeDeviceJourneyManifest } from './t121-three-device-boundary-builder.mjs';

const candidate = { branch: 'dev', clean: true, committed: true, revision: 'a'.repeat(40),
  treeDigest: 'tree', verifications: [{ status: 'passed' }] };
const desktop = (device, empty = false) => ({ counts: { attachments: empty ? 0 : 2,
  contentBlobs: empty ? 0 : 3, nodes: empty ? 1 : 4 }, device,
deviceIdentity: `device-${device}`, integrity: 'ok', restorable: true,
restorePoint: `restore-${device}` });
const android = (groupId = 'group-1') => ({ backup: { attachmentArchivePath: 'attachments.tar',
  created: true, manifestPath: 'android.json', validated: true }, snapshot: { attachments: { sha256: 'hash' },
  database: { counts: { attachments: 2, content_blobs: 3, nodes: 4 }, inspection: {
    activeSyncGroupMemberCount: 2, deviceIdentityFingerprint: 'device-B', syncGroupId: groupId,
    syncGroupTimelineId: 'timeline-1' }, integrity: 'ok' } } });

it('builds one dynamic A+B/empty C boundary from complete restorable manifests', () => {
  const manifest = buildThreeDeviceJourneyManifest({ baselineA: desktop('A'),
    baselineB: android(), baselineInspection: { identity: { groupId: 'group-1',
      timelineId: 'timeline-1' } }, candidate, cReset: {
      baselineProtection: desktop('C', true), originalProtection: desktop('C')
    }, originalA: desktop('A'), originalB: android('group-old') });
  expect(manifest).toMatchObject({ baseline: { devices: { C: { groupId: null,
    counts: { nodes: 1 } } }, groupId: 'group-1' }, phase: 'journey' });
});

it('rejects Android attachment facts without a restorable attachment archive', () => {
  const invalid = android();
  invalid.backup.attachmentArchivePath = null;
  expect(() => buildThreeDeviceJourneyManifest({ baselineA: desktop('A'), baselineB: invalid,
    baselineInspection: { identity: { groupId: 'group-1', timelineId: 'timeline-1' } },
    candidate, cReset: { baselineProtection: desktop('C', true), originalProtection: desktop('C') },
    originalA: desktop('A'), originalB: android('group-old') })).toThrow('incomplete');
});
