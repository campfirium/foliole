import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('persists distinct merge payloads and converges their exchange in the native runtime', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const outcome = await desktopApp.evaluate(runNativeResolutionExchange);
  expect(outcome.distinct).toBe(true);
  expect(outcome.heads[0].version_id).toBe(outcome.heads[1].version_id);
  expect(outcome.heads[0].content_hash).toBe(outcome.heads[1].content_hash);
  expect(outcome.heads[0].snapshot).toEqual(outcome.heads[1].snapshot);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
});

test('keeps a shared highlight branch on its original identity in the native runtime', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const outcome = await desktopApp.evaluate(runNativeSharedHighlight);
  expect(outcome.ack.status).toBe('accepted');
  expect(outcome.ack.canonicalObjectId).toBeUndefined();
  expect(outcome.head.object_id).toBe('shared-highlight');
  expect(outcome.head.body_text).toBe('023\nx=1\n');
  expect(outcome.head.ancestor_version_ids).toEqual(expect.arrayContaining(['base', 'desktop-edit', 'mobile-edit']));
  expect(outcome.nodes).toBe(1);
});

async function runNativeSharedHighlight() {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const load = (file: string) => require(`${process.cwd()}/dist/${file}`);
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const { initializeDatabaseSchema } = load('lib/core/database/migrations.js');
  const { createBetterSqliteDbPort } = load('electron/database/betterSqliteDbPort.js');
  const { applySyncNodesWithDbPort } = load('lib/core/sync/syncNodeApplyExecutor.js');
  const { loadCurrentSyncNodeRecord } = load('lib/core/sync/syncNodeGraph.js');
  const { applyCompanionStateSyncPushWithDbPort } = load('electron/database/companionSyncPushWithDbPort.js');
  const { nodeVersionSyncAdapter } = load('src/shared/platform/companionSyncPushProtocol.js');
  const db = new Database(':memory:');
  const time = '2026-09-30T00:00:00.000Z';
  const base = {
    ancestor_version_ids: [], body_text: '123\nx=0\n', content_hash: 'base', host_name: 'desktop',
    object_id: 'shared-highlight', object_type: 'node', parent_version_id: null, parent_version_ids: [],
    updated_at: time, version_created_at: time, version_id: 'base',
    snapshot: { id: 'shared-highlight', kind: 'topic', title: 'Selection', content: '123\nx=0\n',
      attachments: [], anchor_link: '{"id":"shared-anchor","kind":"highlight"}',
      created_at: time, updated_at: time, deleted_at: null, parent_id: null, position: null,
      priority: null, desired_retention: null, is_title_manual: true, hide_title_heading: false,
      opening_text: null, virtual_filter: null, reveal: null, image_regions: null }
  };
  const branch = (version: string, body: string, host: string) => ({ ...base,
    version_id: version, host_name: host, content_hash: version, body_text: body,
    ancestor_version_ids: ['base'], parent_version_id: 'base', parent_version_ids: ['base'],
    snapshot: { ...base.snapshot, content: body }
  });
  try {
    initializeDatabaseSchema(db);
    const port = createBetterSqliteDbPort(db);
    await applySyncNodesWithDbPort(port, [base]);
    await applySyncNodesWithDbPort(port, [branch('desktop-edit', '023\nx=0\n', 'desktop')]);
    const incoming = branch('mobile-edit', '123\nx=1\n', 'mobile');
    const result = await applyCompanionStateSyncPushWithDbPort(port, [nodeVersionSyncAdapter.buildPushPayload(incoming)]);
    return { ack: result.acks[0], head: await loadCurrentSyncNodeRecord(port, 'shared-highlight'),
      nodes: db.prepare('SELECT count(*) FROM nodes').pluck().get() };
  } finally { db.close(); }
}


async function runNativeResolutionExchange() {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const path = process.getBuiltinModule('path')!;
    const load = (file: string) => require(path.join(process.cwd(), 'dist/electron', file));
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const { initializeDatabaseSchema } = require(path.join(process.cwd(), 'dist/lib/core/database/migrations.js'));
    const { buildResolutionRecord } = require(path.join(process.cwd(), 'dist/lib/core/sync/syncNodeResolution.js'));
    const { loadCurrentSyncNodeRecord } = require(path.join(process.cwd(), 'dist/lib/core/sync/syncNodeGraph.js'));
    const { applySyncNodesWithDbPort } = require(path.join(process.cwd(), 'dist/lib/core/sync/syncNodeApplyExecutor.js'));
    const { createBetterSqliteDbPort } = load('database/betterSqliteDbPort.js');
    const { applyNodePushBatchWithDbPort } = load('database/companionSyncNodeConvergence.js');
    const databases = [new Database(':memory:'), new Database(':memory:')];
    const time = '2026-09-20T00:00:00.000Z';
    function branch(version: string, title: string) {
      return {
        ancestor_version_ids: [], body_text: 'Body', content_hash: version, host_name: version,
        object_id: 'topic', object_type: 'node', parent_version_id: null, parent_version_ids: [],
        updated_at: time, version_created_at: time, version_id: version,
        snapshot: { id: 'topic', kind: 'topic', title, content: 'Body', attachments: [],
          anchor_link: null, created_at: time, updated_at: time, deleted_at: null,
          parent_id: null, position: null, priority: null, desired_retention: null,
          is_title_manual: true, hide_title_heading: false, opening_text: null,
          virtual_filter: null, reveal: null, image_regions: null }
      };
    }
    const a = branch('a', 'Title A');
    const b = branch('b', 'Title B');
    const left = buildResolutionRecord([a, b], a, 'Body');
    const right = buildResolutionRecord([b, a], b, 'Body');
    try {
      for (const db of databases) initializeDatabaseSchema(db);
      const ports = databases.map((db) => createBetterSqliteDbPort(db));
      for (const [index, port] of ports.entries()) {
        await applySyncNodesWithDbPort(port, [a, b]);
        await applySyncNodesWithDbPort(port, [index === 0 ? left : right]);
        const incoming = index === 0 ? right : left;
        const result = await applyNodePushBatchWithDbPort(port, [{
          authorHostName: incoming.host_name, clientOpId: incoming.version_id,
          base: { kind: 'node_version', ancestorVersionIds: incoming.ancestor_version_ids,
            parentVersionId: incoming.parent_version_id, parentVersionIds: incoming.parent_version_ids },
          contentHash: incoming.content_hash, identity: { objectId: 'topic', objectType: 'node', scope: 'workspace' },
          payloadJson: JSON.stringify(incoming), updatedAt: incoming.updated_at
        }]);
        if (result.acks[0]?.status !== 'accepted') throw new Error('resolution exchange rejected');
      }
      return { distinct: left.version_id !== right.version_id,
        heads: await Promise.all(ports.map((port) => loadCurrentSyncNodeRecord(port, 'topic'))) };
    } finally {
      databases.forEach((db) => db.close());
    }
}
