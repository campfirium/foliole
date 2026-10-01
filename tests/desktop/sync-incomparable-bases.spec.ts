import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('settles incomparable body bases with a durable current body and alternative in the native runtime', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const fixture = await desktopApp.evaluate(prepareIncomparableBranches);
  const result = await desktopApp.evaluate(mergeIncomparableBranches, fixture);
  expect(result.accepted).toBe(true);
  expect(result.parents.sort()).toEqual(['left', 'right']);
  expect(result.replayedVersion).toBe(result.version);
  expect(result.reopened.version).toBe(result.version);
  expect(new Set([result.reopened.body, ...result.reopened.alternatives.map((row) => row.body_text)]))
    .toEqual(new Set(['Left body is longer', 'Right body']));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
});

async function prepareIncomparableBranches() {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const fs = process.getBuiltinModule('fs')!;
  const os = process.getBuiltinModule('os')!;
  const path = process.getBuiltinModule('path')!;
  const load = (file: string) => require(`${process.cwd()}/dist/${file}`);
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const { initializeDatabaseSchema } = load('lib/core/database/migrations.js');
  const { createBetterSqliteDbPort } = load('electron/database/betterSqliteDbPort.js');
  const { applySyncNodesWithDbPort } = load('lib/core/sync/syncNodeApplyExecutor.js');
  const { upsertRemoteVersion } = load('lib/core/sync/syncNodeApplyAcceptedRemote.js');
  const { retainLocalEditBase } = load('lib/core/sync/nodeVersionLocalEditHold.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-native-incomparable-'));
  const file = path.join(root, 'library.db');
  const db = new Database(file);
  const time = '2026-10-01T00:00:00.000Z';
  const record = (version: string, body: string, parents: string[]) => ({
    ancestor_version_ids: parents, body_text: body, content_hash: `hash-${version}`,
    host_name: version, object_id: 'topic', object_type: 'node', parent_version_id: parents[0] ?? null,
    parent_version_ids: parents, updated_at: time, version_created_at: time, version_id: version,
    snapshot: { anchor_link: null, attachments: [], content: body, created_at: time, deleted_at: null,
      desired_retention: null, hide_title_heading: false, id: 'topic', image_regions: null,
      is_title_manual: true, kind: 'topic', opening_text: null, parent_id: null,
      position: null, priority: null, reveal: null, title: 'Topic', updated_at: time, virtual_filter: null }
  });
  try {
    initializeDatabaseSchema(db);
    const port = createBetterSqliteDbPort(db);
    for (const version of ['base-a', 'base-b']) {
      await upsertRemoteVersion(port, record(version, version, []));
      await retainLocalEditBase(port, { holdId: version, nodeId: 'topic', versionId: version });
    }
    await applySyncNodesWithDbPort(port, [record('left', 'Left body is longer', ['base-a', 'base-b'])]);
    return { root, file, incoming: record('right', 'Right body', ['base-b', 'base-a']) };
  } catch (error) {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  } finally { if (db.open) db.close(); }
}

async function mergeIncomparableBranches(_electron: unknown, fixture: Awaited<ReturnType<typeof prepareIncomparableBranches>>) {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const fs = process.getBuiltinModule('fs')!;
  const load = (file: string) => require(`${process.cwd()}/dist/${file}`);
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const { createBetterSqlite3Driver } = load('electron/database/betterSqlite3Driver.js');
  const { createBetterSqliteDbPort } = load('electron/database/betterSqliteDbPort.js');
  const { loadNodeBodyResolution } = load('lib/core/database/nodeBodyResolution.js');
  const { loadCurrentSyncNodeRecord } = load('lib/core/sync/syncNodeGraph.js');
  const { applyNodePushBatchWithDbPort } = load('electron/database/companionSyncNodeConvergence.js');
  const { nodeVersionSyncAdapter } = load('src/shared/platform/companionSyncPushProtocol.js');
  const db = new Database(fixture.file);
  try {
    const port = createBetterSqliteDbPort(db);
    const payload = nodeVersionSyncAdapter.buildPushPayload(fixture.incoming);
    const result = await applyNodePushBatchWithDbPort(port, [payload]);
    const merged = await loadCurrentSyncNodeRecord(port, 'topic');
    await applyNodePushBatchWithDbPort(port, [payload]);
    const replayedVersion = (await loadCurrentSyncNodeRecord(port, 'topic')).version_id;
    db.close();
    const reopened = new Database(fixture.file, { readonly: true });
    try {
      const alternatives = reopened.prepare("SELECT body_text FROM node_text_alternatives WHERE status = 'available'")
        .all() as Array<{ body_text: string }>;
      return { accepted: result.acks[0]?.status === 'accepted', parents: merged.parent_version_ids as string[],
        version: merged.version_id as string, replayedVersion: replayedVersion as string,
        reopened: { body: loadNodeBodyResolution(createBetterSqlite3Driver(reopened), 'topic').content as string,
          version: reopened.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get(), alternatives } };
    } finally { reopened.close(); }
  } finally {
    if (db.open) db.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}
