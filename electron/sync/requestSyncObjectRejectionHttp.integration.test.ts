// @vitest-environment node

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { groupKey, record, state, syncServer } from './requestSyncDatabaseHttp.testSupport.js';

it.each(['push', 'pull'] as const)('commits objects before and after an oversized body and leaves only that object pending (%s)', async direction => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const sender = direction === 'push' ? source : target;
  const receiver = direction === 'push' ? target : source;
  const server = syncServer(source, target);
  const rejected: string[] = [];
  try {
    const body = textBranch('b-v1', 'x'.repeat(1_048_577));
    const oversized = { ...body, object_id: 'b', snapshot: { ...body.snapshot, id: 'b' } };
    const dependent = record('d', 'd-v1');
    dependent.snapshot.parent_id = 'b';
    await applyConvergentSyncNodesWithDbPort(sender.db, [record('a', 'a-v1'),
      oversized, record('c', 'c-v1'), dependent]);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const run = () => runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
      transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
      reportObjectError: (difference, error, stage) => rejected.push(`${difference.globalId}:${stage}:${(error as Error).message}`)
    });
    expect(await run()).toMatchObject({ complete: false, pending: 2, transferred: 2, onlyRejectedObjectsPending: true });
    expect(rejected).toEqual(['b:prepare:request_sync_body_too_large']);
    receiver.reopen();
    expect(await receiver.db.query("SELECT id, current_version_id FROM nodes WHERE id IN ('a', 'b', 'c', 'd') ORDER BY id"))
      .toEqual([{ id: 'a', current_version_id: 'a-v1' }, { id: 'c', current_version_id: 'c-v1' }]);
    const repaired = record('b', 'b-v2', oversized);
    await applyConvergentSyncNodesWithDbPort(sender.db, [repaired]);
    expect(await run()).toMatchObject({ complete: true, pending: 0 });
    receiver.reopen();
    expect(await receiver.db.query("SELECT current_version_id FROM nodes WHERE id = 'b'"))
      .toEqual([{ current_version_id: 'b-v2' }]);
    expect(await receiver.db.query("SELECT parent_id FROM nodes WHERE id = 'd'")).toEqual([{ parent_id: 'b' }]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
});

it('reports partial progress after a receiver rejects one object and resumes when the receiver can apply it', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const server = syncServer(source, target);
  const rejected: string[] = [];
  try {
    await applyConvergentSyncNodesWithDbPort(source.db, ['a', 'b', 'c'].map(id => record(id, `${id}-v1`)));
    target.sqlite.exec(`CREATE TRIGGER reject_one_object BEFORE INSERT ON node_sync_versions
      WHEN NEW.object_id = 'b' BEGIN SELECT RAISE(ABORT, 'sync_node_apply_blocked:b'); END`);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing_address');
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
      responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
    const exchange = createDesktopRequestSyncExchange({ context, groupKey,
      groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` });
    const run = () => runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeRequestSyncInventory(source.host, exchange),
      transferObjects: differences => transferRequestSyncBatch(source.host, exchange, differences, { peerState: state(target.id) }),
      reportObjectError: (difference, error, stage) => rejected.push(`${difference.globalId}:${stage}:${(error as Error).message}`)
    });
    expect(await run()).toMatchObject({ complete: false, pending: 1, transferred: 2, onlyRejectedObjectsPending: true });
    expect(rejected).toEqual(['b:apply:sync_node_apply_blocked:b']);
    target.reopen();
    expect(await target.db.query("SELECT id FROM nodes WHERE id IN ('a','b','c') ORDER BY id"))
      .toEqual([{ id: 'a' }, { id: 'c' }]);
    target.sqlite.exec('DROP TRIGGER reject_one_object');
    expect(await run()).toMatchObject({ complete: true, pending: 0 });
    target.reopen();
    expect(await target.db.query("SELECT current_version_id FROM nodes WHERE id = 'b'"))
      .toEqual([{ current_version_id: 'b-v1' }]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fixture.close();
  }
});
