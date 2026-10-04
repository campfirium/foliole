import { beforeEach, expect, it, vi } from 'vitest';

import { syncCompanionObjectsFromDesktop } from './companionDesktopSyncObjects';
import { createEmptyResourceStages } from './companionDesktopSyncResourceStages';

const runtime = vi.hoisted(() => ({ round: vi.fn() }));
vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => 'android' } };
});
vi.mock('./companion/sync/syncGroupIdentityRound', () => ({
  runCompanionSyncIdentityRound: runtime.round
}));
vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosCompanionHostName: async () => 'Phone'
}));

beforeEach(() => vi.resetAllMocks());

it('identifies the active identity exchange before it completes and records its duration', async () => {
  const lines: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((...args) => lines.push(args.join(' ')));
  let complete!: (value: { received: { appliedObjects: number }; resources: { stages: ReturnType<typeof createEmptyResourceStages> } }) => void;
  runtime.round.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const pending = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', {
    runId: 'run-42', includeResources: false
  });
  await vi.waitFor(() => expect(runtime.round).toHaveBeenCalledOnce());
  const started = [...lines];
  complete({ received: { appliedObjects: 3 }, resources: { stages: createEmptyResourceStages() } });
  await expect(pending).resolves.toMatchObject({ appliedPackObjectCount: 3 });
  expect(started).toContainEqual(expect.stringContaining('"stage":"identity_round","status":"started"'));
  expect(started).toContainEqual(expect.stringContaining('"runId":"run-42"'));
  expect(lines).toContainEqual(expect.stringContaining('"stage":"identity_round","status":"completed"'));
  expect(lines).toContainEqual(expect.stringContaining('"elapsedMs":'));
  expect(lines.join('\n')).not.toContain('10.0.2.2');
  vi.restoreAllMocks();
});

it('records a failed identity exchange without printing request details', async () => {
  const lines: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((...args) => lines.push(args.join(' ')));
  runtime.round.mockRejectedValueOnce(new Error('secret request URL or token'));
  await expect(syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', {
    runId: 'run-43', includeResources: false
  })).rejects.toThrow('secret request URL or token');
  expect(lines).toContainEqual(expect.stringContaining('"stage":"identity_round","status":"failed"'));
  expect(lines.join('\n')).not.toContain('secret');
  vi.restoreAllMocks();
});
