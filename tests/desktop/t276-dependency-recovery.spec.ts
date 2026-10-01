import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('retains dependency facts after failed publication and retries in native Electron', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const outcome = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const fs = process.getBuiltinModule('fs')!.promises;
    const path = process.getBuiltinModule('path')!;
    const load = (file: string) => require(path.join(process.cwd(), 'dist/electron', file));
    const { runWithDatabaseConnectionOwner, openDatabaseConnection } = load('database/connection.js');
    const { createCompanionFactSession, readCompanionFactSessionPage } = load('sync/companionLanFactSession.js');
    const { activatePagedCompanionDependencySession } = load('sync/companionLanPagedDependencySession.js');
    const { sessionRoot } = load('sync/companionLanDependencySession.js');
    const { encodeSyncPackFactClaims } = require(path.join(process.cwd(), 'dist/lib/core/sync/syncPackFactPresence.js'));
    return runWithDatabaseConnectionOwner(async () => {
      const driver = openDatabaseConnection().driver;
      const source = driver.queryOne('SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
      const seq = source.high_water + 1;
      driver.execute(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
        VALUES ('t276-node', 'topic', 'T276', 't276-v1', 'now', 'now')`);
      driver.execute(`INSERT INTO node_sync_versions
        (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
        VALUES ('t276-v1', 't276-node', 'source', 'now', 'hash', 'body', '{"content":null}')`);
      driver.execute(`INSERT INTO sync_object_state
        (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
        VALUES ('node', 't276-node', ?, 'hash', 'source', 'now', 0)`, [seq]);
      const fact = await createCompanionFactSession({ groupId: 't276', toPeerId: 'receiver',
        window: { fromStateSeq: source.high_water, toStateSeq: seq, frontierStateSeq: seq, sourceEpoch: source.source_epoch } });
      const viewId = fact.view.sourceViewId;
      fact.view.close();
      const first = await readCompanionFactSessionPage({ groupId: 't276', peerId: 'receiver', viewId });
      await readCompanionFactSessionPage({ groupId: 't276', peerId: 'receiver', viewId,
        previousIndexId: first.index.index_id,
        claimBits: encodeSyncPackFactClaims(first.index, { versions: [], parents: [], reviews: [] }) });
      const root = path.join(sessionRoot('t276', 'receiver'), viewId);
      const published = path.join(root, 'session.json');
      await fs.mkdir(published);
      const args = { groupId: 't276', fromPeerId: 'source', toPeerId: 'receiver', viewId };
      let failed = false;
      try { await activatePagedCompanionDependencySession(args); } catch { failed = true; }
      const held = driver.queryAll('SELECT version_id FROM node_version_outbound_payload_holds WHERE pack_id = ?', [viewId]);
      await fs.rmdir(published);
      const retry = await activatePagedCompanionDependencySession(args);
      try { return { failed, held, rows: retry.transfer.expectedRows, object: retry.transfer.objectId }; }
      finally { retry.view.close(); }
    });
  });
  expect(outcome).toEqual({ failed: true, held: [{ version_id: 't276-v1' }], rows: 1, object: 't276-node' });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
});
