import { beforeEach, expect, it, vi } from 'vitest';

import {
  capacitorMock, resetCompanionDesktopSyncMocks, syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

beforeEach(resetCompanionDesktopSyncMocks);

it('identifies the active sync-pack page before it completes and records its duration', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  const lines: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((...args) => lines.push(args.join(' ')));
  let completePage!: (value: { applied_blob_count: number; applied_object_count: number;
    to_state_seq: number }) => void;
  syncBridgeMock.applyCompanionDesktopSyncPack.mockReturnValueOnce(new Promise((resolve) => {
    completePage = resolve;
  }));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const sync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { runId: 'run-42' });
  await vi.waitFor(() => expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledOnce());
  const inFlightLines = [...lines];

  completePage({ applied_blob_count: 2, applied_object_count: 3, to_state_seq: 8 });
  await sync;
  expect(inFlightLines).toContainEqual(expect.stringContaining('"stage":"structure_page","status":"started"'));
  expect(inFlightLines).toContainEqual(expect.stringContaining('"runId":"run-42"'));
  expect(lines).toContainEqual(expect.stringContaining('"stage":"structure_page","status":"completed"'));
  expect(lines).toContainEqual(expect.stringContaining('"appliedObjects":3'));
  expect(lines).toContainEqual(expect.stringContaining('"elapsedMs":'));
  expect(lines.join('\n')).not.toContain('10.0.2.2');
  vi.restoreAllMocks();
});

it('records the failed page without printing request details', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  const lines: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((...args) => lines.push(args.join(' ')));
  syncBridgeMock.applyCompanionDesktopSyncPack.mockRejectedValueOnce(
    new Error('secret request URL or token')
  );

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await expect(syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { runId: 'run-43' }))
    .rejects.toThrow('secret request URL or token');
  expect(lines).toContainEqual(expect.stringContaining('"stage":"structure_page","status":"failed"'));
  expect(lines.join('\n')).not.toContain('secret');
  vi.restoreAllMocks();
});
