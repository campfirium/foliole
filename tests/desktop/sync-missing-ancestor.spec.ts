import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('keeps both missing-base branches and their available alternative in the native runtime', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const input = await desktopApp.evaluate(prepareNativeBranches);
  const outcome = await desktopApp.evaluate(runNativeMissingAncestorMerge, input);
  expect(outcome.accepted).toBe(true);
  expect(outcome.parents.sort()).toEqual(input.branches.sort());
  expect(outcome.originalBodies.sort()).toEqual(['Left body is longer', 'Right body']);
  expect(outcome.alternatives).toEqual([{ body_text: 'Right body', status: 'available' }]);
  expect(outcome.missingAncestorCreated).toBe(false);
  expect(outcome.replayedVersion).toBe(outcome.mergedVersion);
  expect(outcome.editParents).toEqual([outcome.mergedVersion]);
  expect(outcome.reopened).toEqual({ body: 'Edited after merge', version: outcome.editedVersion,
    alternatives: outcome.alternatives, nodes: 1 });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
});

async function prepareNativeBranches() {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const fs = process.getBuiltinModule('fs')!;
  const path = process.getBuiltinModule('path')!;
  const os = process.getBuiltinModule('os')!;
  const load = (file: string) => require(`${process.cwd()}/dist/${file}`);
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const { initializeDatabaseSchema } = load('lib/core/database/migrations.js');
  const { upsertNodeSnapshot } = load('lib/core/database/nodeMutations.js');
  const { createBetterSqlite3Driver } = load('electron/database/betterSqlite3Driver.js');
  const { createBetterSqliteDbPort } = load('electron/database/betterSqliteDbPort.js');
  const { flushNodeSyncVersionWithDriver } = load('electron/database/nodeSyncVersionFromDriver.js');
  const { applySyncNodesWithDbPort } = load('lib/core/sync/syncNodeApplyExecutor.js');
  const { loadCurrentSyncNodeRecord } = load('lib/core/sync/syncNodeGraph.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-native-missing-ancestor-'));
  const peers = ['left', 'right'].map((name) => {
    const file = path.join(root, `${name}.db`);
    const db = new Database(file);
    initializeDatabaseSchema(db);
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', ?, 'now')").run(JSON.stringify(name));
    return { name, file, db, driver: createBetterSqlite3Driver(db), port: createBetterSqliteDbPort(db) };
  });
  let sequence = 0;
  const edit = (peer: typeof peers[number], content: string) => {
    const at = new Date(Date.UTC(2026, 8, 30, 0, 0, ++sequence)).toISOString();
    return peer.driver.transaction((driver: unknown) => {
      upsertNodeSnapshot(driver, { nodeId: 'topic', kind: 'topic', title: 'Topic', content,
        hostName: peer.name, isTitleManual: true, parentNodeId: null, position: null, reveal: null,
        createdAt: '2026-09-30T00:00:00.000Z', updatedAt: at });
      return flushNodeSyncVersionWithDriver(driver, 'topic', peer.name, at);
    });
  };
  try {
    const [left, right] = peers;
    const ancestor = edit(left, 'Original');
    await applySyncNodesWithDbPort(right.port, [await loadCurrentSyncNodeRecord(left.port, 'topic')]);
    const branches = [edit(left, 'Left body is longer'), edit(right, 'Right body')];
    for (const peer of peers) peer.db.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(ancestor);
    return { root, files: peers.map((peer) => peer.file), ancestor, branches };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  } finally { for (const peer of peers) peer.db.close(); }
}

async function runNativeMissingAncestorMerge(_electron: unknown, input: {
  root: string; files: string[]; ancestor: string; branches: string[];
}) {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const fs = process.getBuiltinModule('fs')!;
  const load = (file: string) => require(`${process.cwd()}/dist/${file}`);
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const { upsertNodeSnapshot } = load('lib/core/database/nodeMutations.js');
  const { loadNodeBodyResolution } = load('lib/core/database/nodeBodyResolution.js');
  const { createBetterSqlite3Driver } = load('electron/database/betterSqlite3Driver.js');
  const { createBetterSqliteDbPort } = load('electron/database/betterSqliteDbPort.js');
  const { flushNodeSyncVersionWithDriver } = load('electron/database/nodeSyncVersionFromDriver.js');
  const { loadCurrentSyncNodeRecord } = load('lib/core/sync/syncNodeGraph.js');
  const { applyNodePushBatchWithDbPort } = load('electron/database/companionSyncNodeConvergence.js');
  const { nodeVersionSyncAdapter } = load('src/shared/platform/companionSyncPushProtocol.js');
  const [left, right] = input.files.map((file) => new Database(file));
  const port = createBetterSqliteDbPort(left);
  try {
    const incoming = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(right), 'topic');
    const payload = nodeVersionSyncAdapter.buildPushPayload(incoming);
    const result = await applyNodePushBatchWithDbPort(port, [payload]);
    const merged = await loadCurrentSyncNodeRecord(port, 'topic');
    const alternatives = left.prepare("SELECT body_text, status FROM node_text_alternatives WHERE node_id = 'topic'").all();
    const originalBodies = left.prepare('SELECT body_text FROM node_sync_versions WHERE version_id IN (?, ?)')
      .pluck().all(...input.branches);
    await applyNodePushBatchWithDbPort(port, [payload]);
    const replayedVersion = (await loadCurrentSyncNodeRecord(port, 'topic')).version_id;
    const driver = createBetterSqlite3Driver(left);
    const at = '2026-09-30T00:00:10.000Z';
    const editedVersion = driver.transaction((tx: unknown) => {
      upsertNodeSnapshot(tx, { nodeId: 'topic', kind: 'topic', title: 'Topic', content: 'Edited after merge',
        hostName: 'left', isTitleManual: true, parentNodeId: null, position: null, reveal: null,
        createdAt: '2026-09-30T00:00:00.000Z', updatedAt: at });
      return flushNodeSyncVersionWithDriver(tx, 'topic', 'left', at);
    });
    const editParents = (await loadCurrentSyncNodeRecord(port, 'topic')).parent_version_ids;
    const missingAncestorCreated = Boolean(left.prepare('SELECT version_id FROM node_sync_versions WHERE version_id = ?').get(input.ancestor));
    left.close();
    const reopened = new Database(input.files[0], { readonly: true });
    try {
      return { accepted: result.acks[0]?.status === 'accepted', parents: merged.parent_version_ids,
        originalBodies, alternatives, missingAncestorCreated, replayedVersion,
        mergedVersion: merged.version_id, editedVersion, editParents,
        reopened: { body: loadNodeBodyResolution(createBetterSqlite3Driver(reopened), 'topic').content,
          version: reopened.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get(),
          alternatives: reopened.prepare("SELECT body_text, status FROM node_text_alternatives WHERE node_id = 'topic'").all(),
          nodes: reopened.prepare("SELECT count(*) FROM nodes WHERE id LIKE 'topic%'").pluck().get() } };
    } finally { reopened.close(); }
  } finally {
    for (const db of [left, right]) if (db.open) db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
}
