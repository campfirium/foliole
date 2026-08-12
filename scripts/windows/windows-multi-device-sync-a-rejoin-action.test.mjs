import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runWindowsMultiDeviceSyncARejoin } from './windows-multi-device-sync-a-rejoin-action.mjs';

const identity = { activeMemberCount: 3, attachmentCount: 1, contentBlobCount: 4,
  facts: {}, journeyFacts: {}, localGroupId: 'group-1', localMemberState: 'active',
  localTimelineId: 'timeline-1', missingAttachmentCount: 0, missingContentBlobCount: 0,
  nodeCount: 5 };

it('creates C fact only after fresh A and B facts and verifies a restarted three-member result', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-a-rejoin-'));
  const ids = { A: 'multi-device-sync-a-new', B: 'multi-device-sync-b-new',
    C: 'multi-device-sync-c-new' };
  const complete = { ...identity, facts: Object.fromEntries(Object.values(ids).map((id) => [id, true])),
    journeyFacts: Object.fromEntries(Object.entries(ids).map(([origin, id]) => [id, origin])) };
  const pendingBodies = { ...complete, missingContentBlobCount: 3 };
  const inspect = vi.fn()
    .mockResolvedValueOnce({ ...identity, journeyFacts: { 'multi-device-sync-a-old': 'A' } })
    .mockResolvedValueOnce({ ...identity, journeyFacts: {
      'multi-device-sync-a-old': 'A', [ids.A]: 'A', [ids.B]: 'B'
    } })
    .mockResolvedValueOnce(pendingBodies)
    .mockResolvedValue(complete);
  const close = vi.fn(async () => {});
  const result = await runWindowsMultiDeviceSyncARejoin({ evidenceRoot: root,
    control: vi.fn(), execute: vi.fn(), inspect, paths: {}, suspend: vi.fn(async () => ({ running: false })),
    restore: vi.fn(async () => {}), openSession: vi.fn(async () => ({ app: { close }, page: {} })),
    invoke: vi.fn(), createFact: vi.fn(async () => ({ factId: ids.C })) });
  expect(result.multiDeviceSyncARejoin.manifestPath).toContain('multi-device-sync-a-rejoin-receipt.json');
  expect(JSON.parse(fs.readFileSync(result.multiDeviceSyncARejoin.manifestPath, 'utf8')))
    .toMatchObject({ factIds: ids, resultStatus: 'success', restarted: { activeMemberCount: 3 } });
  expect(close).toHaveBeenCalledTimes(4);
  expect(inspect).toHaveBeenCalledTimes(5);
});
