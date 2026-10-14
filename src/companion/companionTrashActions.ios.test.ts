// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

import { toCompanionNativeNodeVersion } from './companionAnnotationNodeVersion';
import { restoreCompanionTrashNode } from './companionTrashActions';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: DbPort) => unknown) => task(native.db!),
    readSnapshot: (task: (db: DbPort) => unknown) => task(native.db!),
    runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
  })
}));

async function seedTrashedNode() {
  const node = createSnapshot().nodesById['topic-trash']!;
  await applyCompanionLocalNodeVersions([await toCompanionNativeNodeVersion(
    { ...node, currentVersionId: null }, 'ios-device', 'desktop#base')]);
}

it('persists an iOS trash restore and synchronizes its whole body after restart', async () => {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath);
  try {
    await seedTrashedNode();
    await host.sync();
    expect(desktop.prepare("SELECT deleted_at FROM nodes WHERE id = 'topic-trash'").get())
      .toEqual({ deleted_at: '2026-07-21T00:00:00.000Z' });
    const result = await restoreCompanionTrashNode({ deviceId: 'ios-device', nodeId: 'topic-trash',
      snapshot: createSnapshot(), versionId: 'restored-version' });
    expect(result?.snapshot.nodesById['topic-trash']?.deletedAt).toBeNull();
    expect(result?.snapshot.trashedNodeIds).toEqual([]);
    await host.sync();
    await host.sync();
    await host.restart();
    for (const db of [host.sqlite, desktop]) {
      expect(db.prepare("SELECT current_version_id, deleted_at, content FROM nodes WHERE id = 'topic-trash'").get())
        .toEqual({ current_version_id: 'restored-version', deleted_at: null, content: 'Body' });
      expect(db.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = 'restored-version'").all())
        .toEqual([{ parent_version_id: 'desktop#base' }]);
    }
  } finally { desktop.close(); await host.close(); }
}, 20000);

it('rejects an iOS restore when its persisted base has advanced without changing either version', async () => {
  const host = await createCompanionRequestFixture();
  try {
    await seedTrashedNode();
    await applyCompanionLocalNodeVersions([await toCompanionNativeNodeVersion(
      createSnapshot().nodesById['topic-trash']!, 'ios-device', 'desktop#newer')]);
    const read = () => ({ nodes: host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all(),
      versions: host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all() });
    const before = read();
    await expect(restoreCompanionTrashNode({ deviceId: 'ios-device', nodeId: 'topic-trash',
      snapshot: createSnapshot() })).rejects.toThrow('local_restore_not_applied');
    expect(read()).toEqual(before);
  } finally { await host.close(); }
}, 20000);

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {
      'topic-trash': {
        anchorLink: null,
        content: 'Body',
        createdAt: '2026-07-20T00:00:00.000Z',
        currentVersionId: 'desktop#base',
        deletedAt: '2026-07-21T00:00:00.000Z',
        hideTitleHeading: false,
        id: 'topic-trash',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Trashed topic',
        updatedAt: '2026-07-21T00:00:00.000Z'
      }
    },
    trashedNodeDeletedAtById: { 'topic-trash': '2026-07-21T00:00:00.000Z' },
    trashedNodeIds: ['topic-trash'],
    untitledSequenceByParent: {}
  };
}
