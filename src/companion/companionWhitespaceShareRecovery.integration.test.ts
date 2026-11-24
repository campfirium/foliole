// @vitest-environment node
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ loadPendingShares: vi.fn(), acknowledgeShare: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === 'FolioleCompanionShareInbox' },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), ...native })
  };
});

import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { consumeCompanionShareInbox } from './companionShareInboxRuntime';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';

async function shareInboxWorkspace(library: Awaited<ReturnType<typeof createSearchLibrary>>, receivedAt: string) {
  library.database.prepare("INSERT OR IGNORE INTO nodes (id,title,kind,created_at,updated_at) VALUES ('inbox','Inbox','folder',?,?)")
    .run(receivedAt, receivedAt);
  const state = await loadCompanionWorkspaceSyncState();
  const actions = createWorkspaceSnapshotActions({ state, setState: () => {}, setError: () => {},
    setStatus: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  return { bootstrapState: { device_id: 'share-device' }, state, refreshAfterMutation: actions.refreshAfterMutation };
}

it('drains a queued Android whitespace-only share and saves the next delivery', async () => {
  const library = await createSearchLibrary(0);
  const blank = '00000000-0000-4000-8000-000000000001';
  const valid = '00000000-0000-4000-8000-000000000002';
  const received_at = '2026-11-24T10:00:00Z';
  const text = '\u00a0Keep these spaces\u00a0';
  let items = [
    { delivery_id: blank, received_at, parts: [{ kind: 'text', value: '\u00a0\u202f\ufeff\n' }] },
    { delivery_id: valid, received_at, parts: [{ kind: 'text', value: text }] }
  ];
  native.loadPendingShares.mockImplementation(async () => ({ items }));
  native.acknowledgeShare.mockImplementation(async ({ delivery_id }) => {
    items = items.filter(item => item.delivery_id !== delivery_id);
  });

  try {
    await consumeCompanionShareInbox(await shareInboxWorkspace(library, received_at));

    expect(items).toEqual([]);
    expect(native.acknowledgeShare.mock.calls).toEqual([[{ delivery_id: blank }], [{ delivery_id: valid }]]);
    await reopenSearchLibrary(library.root, received_at);
    expect(await loadCompanionWorkspaceNode(`node-share-${blank}`)).toBeNull();
    expect((await loadCompanionWorkspaceNode(`node-share-${valid}`))?.content).toBe(text);
  } finally { await library.close(); }
});

it('saves the surrounding shares and retries an empty delivery whose acknowledgement failed', async () => {
  const library = await createSearchLibrary(0);
  const earlier = '00000000-0000-4000-8000-000000000001';
  const blank = '00000000-0000-4000-8000-000000000002';
  const later = '00000000-0000-4000-8000-000000000003';
  const received_at = '2026-11-24T10:00:00Z';
  let items = [
    { delivery_id: earlier, received_at, parts: [{ kind: 'text', value: 'Earlier share' }] },
    { delivery_id: blank, received_at, parts: [{ kind: 'text', value: '\u00a0' }] },
    { delivery_id: later, received_at, parts: [{ kind: 'text', value: 'Later share' }] }
  ];
  const failure = new Error('Failed to acknowledge shared text.');
  let shouldFail = true;
  native.loadPendingShares.mockImplementation(async () => ({ items }));
  native.acknowledgeShare.mockImplementation(async ({ delivery_id }) => {
    if (delivery_id === blank && shouldFail) {
      shouldFail = false;
      throw failure;
    }
    items = items.filter(item => item.delivery_id !== delivery_id);
  });

  try {
    const workspace = await shareInboxWorkspace(library, received_at);
    await expect(consumeCompanionShareInbox(workspace)).rejects.toBe(failure);
    expect((await loadCompanionWorkspaceNode(`node-share-${earlier}`))?.content).toBe('Earlier share');
    expect((await loadCompanionWorkspaceNode(`node-share-${later}`))?.content).toBe('Later share');
    expect(items.map(item => item.delivery_id)).toEqual([blank]);

    await consumeCompanionShareInbox(workspace);
    expect(items).toEqual([]);
    await reopenSearchLibrary(library.root, received_at);
    expect(await loadCompanionWorkspaceNode(`node-share-${blank}`)).toBeNull();
    expect((await loadCompanionWorkspaceNode(`node-share-${earlier}`))?.content).toBe('Earlier share');
    expect((await loadCompanionWorkspaceNode(`node-share-${later}`))?.content).toBe('Later share');
  } finally { await library.close(); }
});
