import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  load: vi.fn(),
  persist: vi.fn()
}));

vi.mock('../shared/platform/companion/shareInbox', () => ({
  acknowledgeCompanionShare: runtime.acknowledge,
  FolioleCompanionShareInbox: { addListener: vi.fn() },
  loadPendingCompanionShares: runtime.load
}));
vi.mock('./companionCaptureTextActions', () => ({ persistCompanionCapturedText: runtime.persist }));

import { consumeCompanionShareInbox } from './companionShareInboxRuntime';

beforeEach(() => vi.clearAllMocks());

it('persists each native delivery before acknowledging it', async () => {
  const snapshot = { nodesById: {} } as never;
  const nextSnapshot = { nodesById: { saved: {} } } as never;
  runtime.load.mockResolvedValue([{ delivery_id: '00000000-0000-4000-8000-000000000001',
    received_at: '2026-09-21T00:00:00.000Z', parts: [
      { kind: 'title', value: 'Title' }, { kind: 'url', value: 'https://example.org' }
    ] }]);
  runtime.persist.mockResolvedValue({ nodeId: 'node-share', snapshot: nextSnapshot });
  const replaceSnapshot = vi.fn(async () => undefined);

  await consumeCompanionShareInbox({
    bootstrapState: { device_id: 'device' }, replaceSnapshot,
    state: { workspace_snapshot: snapshot }
  });

  expect(runtime.persist).toHaveBeenCalledWith(expect.objectContaining({
    nodeId: 'node-share-00000000-0000-4000-8000-000000000001',
    preserveBoundaryWhitespace: true,
    text: 'Title\n\nhttps://example.org',
    versionId: 'ver_share_00000000-0000-4000-8000-000000000001'
  }));
  expect(replaceSnapshot).toHaveBeenCalledWith(nextSnapshot, 'node-share');
  expect(runtime.acknowledge).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  expect(replaceSnapshot.mock.invocationCallOrder[0]!)
    .toBeLessThan(runtime.acknowledge.mock.invocationCallOrder[0]!);
});

it('leaves the native item pending when persistence fails', async () => {
  runtime.load.mockResolvedValue([{ delivery_id: '00000000-0000-4000-8000-000000000002',
    received_at: '2026-09-21T00:00:00.000Z', parts: [{ kind: 'text', value: 'Note' }] }]);
  runtime.persist.mockRejectedValue(new Error('storage unavailable'));

  await expect(consumeCompanionShareInbox({
    bootstrapState: { device_id: 'device' }, replaceSnapshot: vi.fn(),
    state: { workspace_snapshot: {} as never }
  })).rejects.toThrow('storage unavailable');
  expect(runtime.acknowledge).not.toHaveBeenCalled();
});
