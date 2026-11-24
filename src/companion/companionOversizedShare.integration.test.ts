// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { companionNodeSqliteLibrary } from '../shared/platform/companion/runtime/companionNodeSqlite.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { closeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { consumeCompanionShareInbox } from './companionShareInboxRuntime';

const native = vi.hoisted(() => ({ loadPendingShares: vi.fn(), acknowledgeShare: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === 'FolioleCompanionShareInbox' },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), ...native })
  };
});

async function consume() {
  return consumeCompanionShareInbox({
    bootstrapState: { device_id: 'share-device' },
    state: await loadCompanionWorkspaceSyncState(),
    refreshAfterMutation: async () => {}
  });
}

it('keeps the oversized original and saves later shares once across reopen', async () => {
  const library = companionNodeSqliteLibrary();
  const now = '2026-10-03T00:00:00Z';
  const oversized = { delivery_id: '00000000-0000-4000-8000-000000000001', received_at: now,
    parts: [{ kind: 'text', value: '中'.repeat(349_526) }] };
  const valid = { ...oversized, delivery_id: '00000000-0000-4000-8000-000000000002',
    parts: [{ kind: 'text', value: 'Short note' }] };
  let items = [oversized, valid];
  native.loadPendingShares.mockImplementation(async () => ({ items: [...items] }));
  native.acknowledgeShare.mockImplementation(async ({ delivery_id }) => {
    items = items.filter(item => item.delivery_id !== delivery_id);
  });
  try {
    await library.open();
    await expect(consume()).rejects.toThrow('text_body_too_large');
    expect(items).toEqual([oversized]);

    await closeIosCompanionDatabase();
    const reopened = await library.open();
    await expect(consume()).rejects.toThrow('text_body_too_large');
    expect(items).toEqual([oversized]);
    expect((await loadCompanionWorkspaceNode(`node-share-${valid.delivery_id}`))?.content).toBe('Short note');
    expect(await reopened.read(db => db.query("SELECT version_id FROM node_sync_versions WHERE object_id LIKE 'node-share-%'")))
      .toEqual([{ version_id: `ver_share_${valid.delivery_id}` }]);
  } finally { await library.dispose(); }
});
