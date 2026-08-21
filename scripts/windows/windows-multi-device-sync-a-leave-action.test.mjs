import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  assertWindowsSurvivorState, runWindowsMultiDeviceSyncALeave
} from './windows-multi-device-sync-a-leave-action.mjs';

const initial = {
  activeHosts: { desktop: ['Mac A', 'Windows C'], mobile: ['Android B'] }, activeMemberCount: 3,
  journeyFacts: { old: 'A' }, localGroupId: 'group-1', localHostName: 'Windows C',
  localMemberState: 'active', localTimelineId: 'timeline-1'
};
const survivor = {
  ...initial, activeHosts: { desktop: ['Windows C'], mobile: ['Android B'] }, activeMemberCount: 2,
  departedAtByHost: { 'Mac A': '2026-08-12T12:00:00.000Z' },
  departedHosts: { desktop: ['Mac A'] }, facts: { 'fact-b': true, 'fact-c': true },
  integrity: 'ok', journeyFacts: { old: 'A', 'fact-b': 'B', 'fact-c': 'C' },
  journeyFactUpdates: { old: '2026-08-12T11:00:00.000Z',
    'fact-b': '2026-08-12T12:01:00.000Z', 'fact-c': '2026-08-12T12:02:00.000Z' },
  missingAttachmentCount: 0, missingContentBlobCount: 0
};

it('requires one stable two-member group and one departed former member', () => {
  expect(assertWindowsSurvivorState({ facts: survivor, initial, ids: ['fact-b', 'fact-c'] }))
    .toEqual({ activeMembers: ['Android B', 'Windows C'], formerHostName: 'Mac A',
      formerLeftAt: '2026-08-12T12:00:00.000Z' });
  expect(() => assertWindowsSurvivorState({
    facts: { ...survivor, localTimelineId: 'timeline-2' }, initial
  })).toThrow('did not preserve the two-member Sync Group');
});

it('creates C after departure and records restarted B/C convergence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-a-leave-'));
  const inspect = vi.fn()
    .mockResolvedValueOnce(initial)
    .mockImplementation(async (_execute, _paths, _databasePath, factIds = []) => ({
      ...survivor,
      facts: Object.fromEntries(factIds.map((id) => [id, true]))
    }));
  const close = vi.fn(async () => {});
  const createFact = vi.fn(async () => ({ factId: 'fact-c' }));
  const reportProgress = vi.fn();
  let releaseProvider;
  const waitForConsumerRelease = vi.fn(() => new Promise((resolve) => { releaseProvider = resolve; }));
  const work = runWindowsMultiDeviceSyncALeave({ evidenceRoot: root,
    control: vi.fn(), createFact, execute: vi.fn(),
    inspect, invoke: vi.fn(), openSession: vi.fn(async () => ({ app: { close }, page: {} })),
    paths: {}, reportProgress, restore: vi.fn(async () => {}),
    suspend: vi.fn(async () => ({ running: false })),
    waitForConsumerRelease });
  await vi.waitFor(() => expect(waitForConsumerRelease).toHaveBeenCalledOnce(), { timeout: 2_500 });
  expect(reportProgress).toHaveBeenCalledWith({ factId: 'fact-c', milestone: 'c-fact-created' });
  expect(close).toHaveBeenCalledTimes(1);
  releaseProvider();
  const result = await work;
  const receipt = JSON.parse(fs.readFileSync(result.multiDeviceSyncALeave.manifestPath, 'utf8'));
  expect(receipt).toMatchObject({ factIds: { B: 'fact-b', C: 'fact-c' },
    proof: { formerHostName: 'Mac A' }, restarted: { activeMemberCount: 2 } });
  expect(createFact).toHaveBeenCalledWith(expect.objectContaining({ device: 'C', withAttachment: true }));
  expect(inspect).toHaveBeenNthCalledWith(4, expect.anything(), expect.anything(), undefined,
    ['fact-b', 'fact-c']);
  expect(waitForConsumerRelease).toHaveBeenCalledWith({
    action: 'multi-device-sync-a-leave', repoRoot: undefined
  });
  expect(close).toHaveBeenCalledTimes(2);
  fs.rmSync(root, { force: true, recursive: true });
});
