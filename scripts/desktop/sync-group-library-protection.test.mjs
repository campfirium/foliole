import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { inventoryLibrary, protectOwnedLibrary } from './sync-group-library-protection.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-library-protection-'));
  const sourceRoot = path.join(root, 'source');
  fs.mkdirSync(path.join(sourceRoot, 'Data'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'Assets'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'Data', 'foliole.db'), 'database');
  fs.writeFileSync(path.join(sourceRoot, 'Assets', 'asset'), 'asset');
  return { backupRoot: path.join(root, 'backup'), root, sourceRoot };
}

function inspection(overrides = {}) {
  return { activeMemberCount: 2, attachmentCount: 4, contentBlobCount: 5,
    deviceIdentity: 'device-a', integrity: 'ok', localGroupId: 'group-1',
    localMemberState: 'active', localTimelineId: 'timeline-1', nodeCount: 3, ...overrides };
}

it('copies and byte-verifies a stopped complete desktop library into a distinct restore point', async () => {
  const paths = fixture();
  const result = await protectOwnedLibrary({ ...paths, device: 'A',
    inspectDatabase: () => inspection(), ownerStopped: true });
  expect(result).toMatchObject({ counts: { attachments: 4, contentBlobs: 5, nodes: 3 },
    device: 'A', groupId: 'group-1', integrity: 'ok', restorable: true,
    timelineId: 'timeline-1' });
  expect(inventoryLibrary(paths.backupRoot)).toEqual(inventoryLibrary(paths.sourceRoot));
});

it('refuses a running owner, overlapping roots, reused destination, or incomplete inspection', async () => {
  const running = fixture();
  await expect(protectOwnedLibrary({ ...running, device: 'A',
    inspectDatabase: () => inspection(), ownerStopped: false })).rejects.toThrow('owner must be stopped');
  const overlap = fixture();
  await expect(protectOwnedLibrary({ backupRoot: path.join(overlap.sourceRoot, 'backup'),
    device: 'A', inspectDatabase: () => inspection(), ownerStopped: true,
    sourceRoot: overlap.sourceRoot })).rejects.toThrow('must not overlap');
  const reused = fixture();
  fs.mkdirSync(reused.backupRoot);
  await expect(protectOwnedLibrary({ ...reused, device: 'A',
    inspectDatabase: () => inspection(), ownerStopped: true })).rejects.toThrow('already exists');
  const incomplete = fixture();
  await expect(protectOwnedLibrary({ ...incomplete, device: 'A',
    inspectDatabase: () => inspection({ integrity: 'damaged' }), ownerStopped: true }))
    .rejects.toThrow('not a complete protection baseline');
});
