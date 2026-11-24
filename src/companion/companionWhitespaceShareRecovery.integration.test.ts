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

import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { consumeCompanionShareInbox } from './companionShareInboxRuntime';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';

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
    library.database.prepare("INSERT OR IGNORE INTO nodes (id,title,kind,created_at,updated_at) VALUES ('inbox','Inbox','folder',?,?)")
      .run(received_at, received_at);
    const state = await loadCompanionWorkspaceSyncState();
    const actions = createWorkspaceSnapshotActions({ state, setState: () => {}, setError: () => {},
      setStatus: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {} });
    await consumeCompanionShareInbox({ bootstrapState: { device_id: 'share-device' }, state,
      refreshAfterMutation: actions.refreshAfterMutation });

    expect(items).toEqual([]);
    expect(native.acknowledgeShare.mock.calls).toEqual([[{ delivery_id: blank }], [{ delivery_id: valid }]]);
    await reopenSearchLibrary(library.root, received_at);
    expect(await loadCompanionWorkspaceNode(`node-share-${blank}`)).toBeNull();
    expect((await loadCompanionWorkspaceNode(`node-share-${valid}`))?.content).toBe(text);
  } finally { await library.close(); }
});
