// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertNodeSnapshot, type UpsertNodeSnapshotInput } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { prepareDesktopNodeIndex } from './desktopNodeIndex.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { buildNodeSyncSnapshotFromDriver, loadNodeSyncVersionSourceFromDriver } from './nodeSyncVersionSourceFromDriver.js';
import { restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, sendReviews } from './reviewProjection.testSupport.js';

function material(nodeId: string, kind: UpsertNodeSnapshotInput['kind'], parentNodeId: string | null, priority: number) {
  return { nodeId, kind, parentNodeId, priority, title: nodeId, content: kind === 'folder' ? '' : 'Learn this',
    reveal: null, anchorLink: null, isTitleManual: true, position: null, createdAt: firstAt, updatedAt: firstAt };
}

function prepareWriter(peer: RestorePeer) {
  peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING')
    .run('host_name', JSON.stringify(peer.id), firstAt);
  const driver = createBetterSqlite3Driver(peer.sqlite);
  bindParentOrderWriter(driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  return driver;
}

async function setAndSync(source: RestorePeer, target: RestorePeer, input: UpsertNodeSnapshotInput) {
  const driver = prepareWriter(source);
  upsertNodeSnapshot(driver, input);
  flushNodeSyncVersionWithDriver(driver, input.nodeId, source.id, input.updatedAt);
  await sendReviews(source, target, true, [], input.nodeId);
}

function expectEffective(peers: RestorePeer[], effective: number, own: number) {
  for (const peer of peers) {
    expect(prepareDesktopNodeIndex(peer.sqlite, 5).priorities.get('topic')).toBe(effective);
    expect(peer.sqlite.prepare("SELECT priority FROM nodes WHERE id = 'topic'").pluck().get()).toBe(own);
  }
}

it('preserves nested rules and the original priority through framed sync, reopen, moves and disabling', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const peers = [source, target];
  const outer = material('outer', 'folder', null, 3);
  const inner = material('inner', 'folder', 'outer', 2);
  const topic = material('topic', 'topic', 'inner', 9);
  try {
    await setAndSync(source, target, { ...outer, enforcePriority: true });
    await setAndSync(source, target, inner);
    await setAndSync(source, target, topic);
    expectEffective(peers, 3, 9);
    await setAndSync(source, target, { ...inner, enforcePriority: true, updatedAt: '2026-10-02T08:00:00.000Z' });
    expectEffective(peers, 2, 9);
    for (const peer of peers) peer.reopen();
    expectEffective(peers, 2, 9);
    await setAndSync(source, target, { ...topic, parentNodeId: 'outer', priority: 7, updatedAt: '2026-10-03T08:00:00.000Z' });
    expectEffective(peers, 3, 7);
    await setAndSync(source, target, { ...outer, enforcePriority: false, updatedAt: '2026-10-04T08:00:00.000Z' });
    expectEffective(peers, 7, 7);
  } finally { await fixture.close(); }
});

it.each(['desktop', 'companion'])('keeps existing priority unforced during the %s upgrade', async host => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    const row = material('folder', 'folder', null, 3);
    upsertNodeSnapshot(prepareWriter(peer), row);
    peer.sqlite.exec(`ALTER TABLE nodes DROP COLUMN enforce_priority; PRAGMA user_version = ${host === 'desktop' ? 201 : 125}`);
    if (host === 'desktop') initializeDatabaseSchema(peer.sqlite);
    else await peer.db.transaction(db => migrateCompanionDatabase(db, 125, 126));
    peer.reopen();
    expect(peer.sqlite.prepare("SELECT priority, enforce_priority FROM nodes WHERE id = 'folder'").get())
      .toEqual({ priority: 3, enforce_priority: null });
  } finally { await fixture.close(); }
});

it('leaves a leftover enforcement flag out of the sync snapshot once a node is no longer a folder', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    const driver = prepareWriter(peer);
    upsertNodeSnapshot(driver, { ...material('folder', 'folder', null, 3), enforcePriority: true });
    peer.sqlite.exec("UPDATE nodes SET kind = 'topic' WHERE id = 'folder'");
    const row = loadNodeSyncVersionSourceFromDriver(driver, 'folder')!;
    expect(buildNodeSyncSnapshotFromDriver(driver, row, 'folder')).not.toHaveProperty('enforce_priority');
  } finally { await fixture.close(); }
});
