// @vitest-environment node
import { expect, it } from 'vitest';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { prepareImportedNodeDeletionVersions } from '../database/importedNodeDeletionVersions.js';
import type { RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { edit, stats, text, withRelayPeers } from './webDavRelayBodyRound.testSupport.js';

it('consumes a stale grade for a permanently deleted item and publishes the deletion and local edit', async () => {
  await withRelayPeers(async ({ source, target, sync }) => {
    grade(target, 'shared');
    expect(await sync(target)).toMatchObject({ published: 1 });

    permanentlyDelete(source, 'shared');
    const tombstone = 'SELECT version_id FROM node_sync_tombstones WHERE node_id = ?';
    const deletion = await source.db.query(tombstone, ['shared']);
    expect(deletion).toHaveLength(1);
    await edit(source, 'mac-pending', 'Pending Mac body');

    expect(await sync(source)).toMatchObject({ applied: 1, published: 1 });
    source.reopen();
    expect(await source.db.query('SELECT op_id FROM review_log')).toEqual([]);
    const replay = stats();
    expect(await sync(source, replay)).toMatchObject({ applied: 0, published: 0 });
    expect(replay.requests.GET).toBeUndefined();

    expect(await sync(target)).toMatchObject({ applied: 2 });
    target.reopen();
    expect(await text(target, 'mac-pending')).toBe('Pending Mac body');
    expect(await text(target, 'shared')).toBeUndefined();
    expect(await target.db.query(tombstone, ['shared'])).toEqual(deletion);
    expect(await target.db.query('SELECT op_id FROM review_log')).toEqual([]);
  });
});

it('sends local changes while a grade waits for its item and applies the grade after the item arrives', async () => {
  const published: string[] = [];
  let outgoing = '';
  let hideFirstPacket = false;
  await withRelayPeers(async ({ source, target, scope, sync }) => {
    outgoing = (await scope(source)).outgoing.pathname;
    const id = 'delayed-item';
    const item = textBranch('delayed-item-head', 'Delayed review material');
    await applySyncNodesWithDbPort(source.db, [{ ...item, object_id: id,
      snapshot: { ...item.snapshot, id, kind: 'item' } }], { operation: 'local_mutation' });
    expect(await sync(source)).toMatchObject({ published: 1 });
    grade(source, id);
    expect(await sync(source)).toMatchObject({ published: 1 });
    expect(published).toHaveLength(2);

    hideFirstPacket = true;
    await edit(target, 'phone-pending', 'Pending phone body');
    const receiveKey = `webdav_relay_last_receive:${(await scope(target)).receiveScope.bindingId}`;
    const receiveReceipt = () => target.db.query('SELECT value FROM sync_group_metadata WHERE key = ?', [receiveKey]);
    const priorReceive = await receiveReceipt();
    const pending = stats();
    await expect(sync(target, pending)).rejects.toThrow('webdav_relay_body_dependency_pending');
    expect(pending.requests.MOVE).toBe(1);
    expect(await text(target, id)).toBeUndefined();
    expect(await target.db.query('SELECT op_id FROM review_log')).toEqual([]);
    expect(await receiveReceipt()).toEqual(priorReceive);
    await sync(source);
    source.reopen();
    expect(await text(source, 'phone-pending')).toBe('Pending phone body');

    target.reopen();
    hideFirstPacket = false;
    await sync(target);
    target.reopen();
    expect(await text(target, id)).toBe('Delayed review material');
    expect(await target.db.query('SELECT op_id, node_id, grade FROM review_log'))
      .toEqual([{ op_id: 'grade', node_id: id, grade: 3 }]);
  }, (response, request) => {
    const destination = request.headers.destination;
    if (request.method === 'MOVE' && typeof destination === 'string') {
      const name = new URL(destination).pathname;
      if (name.startsWith(outgoing)) published.push(name);
    }
    if (!hideFirstPacket || request.method !== 'PROPFIND' || request.url !== outgoing || request.headers.depth !== '1') {
      return false;
    }
    response.writeHead(207).end('<D:multistatus xmlns:D="DAV:">' + published.slice(1).map(name =>
      `<D:response><D:href>${name}</D:href></D:response>`).join('') + '</D:multistatus>');
    return true;
  });
});

function grade(peer: RestorePeer, nodeId: string) {
  const at = new Date().toISOString();
  const card = { due: at, last_review: at, state: 2 as const, stability: 1, difficulty: 2,
    elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0 };
  applyReviewGrade(createBetterSqlite3Driver(peer.sqlite), {
    nodeId, opId: 'grade', grade: 3, reviewedAt: at,
    schedulerVersion: 'test', cardBefore: card, cardAfter: card
  }, { hostName: peer.id, createId: () => 'grade-row' });
}

function permanentlyDelete(peer: RestorePeer, nodeId: string) {
  const driver = createBetterSqlite3Driver(peer.sqlite);
  const deletedAt = new Date().toISOString();
  peer.sqlite.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: peer.sqlite, driver });
  driver.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('host_name', ?, ?)",
    [peer.id, deletedAt]);
  prepareImportedNodeDeletionVersions(driver, [nodeId], deletedAt);
  deleteNodesPermanently(driver, { nodeIds: [nodeId], deletedAt });
}
