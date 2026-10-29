// @vitest-environment node
import path from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries, root, type Peer } from '../../electron/database/syncLibrary.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.js';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { applyDailyFlowTable } from '../../lib/core/sync/dailyFlowTableApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { RequestSyncFiles, withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { act, exchange, node, open, persistence, setupPeers } from '../test/dailyFlowExceptions.testSupport.js';


afterEach(closeLibraries);

async function prepared() {
  const peers = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peers[0], id, 'item');
  await exchange(...peers);
  return peers;
}

async function withSnapshot<T>(peer: Peer, id: string, task: (files: RequestSyncFiles) => Promise<T>) {
  const entry = (await readFramedSyncInventory(peer.port)).find(value => value.globalId === id && value.objectType === 'daily_flow')!;
  const difference = compareFramedSyncInventories({ local: [entry], remote: [] })[0]!;
  return withRequestSyncFiles(createDesktopFramedSyncFiles(path.join(root, crypto.randomUUID())), async files => {
    await peer.port.transaction(tx => writeRequestSyncSnapshot(tx, difference, files));
    return task(files);
  });
}

function rootId(peer: Peer) {
  return peer.db.prepare('SELECT root_id FROM daily_flow_sync_projection').pluck().get() as string;
}

it('retains a locally committed operation made after the sender captured its whole table', async () => {
  const [a, b] = await prepared();
  const initial = await open(a);
  await exchange(a, b);
  await withSnapshot(a, rootId(a), async files => {
    const local = await open(b);
    await act(b, local, 'grade', '2026-10-26T08:02:00.000Z');
    const localHead = b.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get();
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, rootId(a), b.name));
    expect(b.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get()).toBe(localHead);
    expect(b.db.prepare('SELECT count(*) FROM daily_flow_projection_facts').pluck().get()).toBe(2);
    expect((await readDailyFlow(b.port))!.session.reviewedItemCount).toBe(1);
  });
  await act(a, initial, 'grade', '2026-10-26T08:01:00.000Z');
  await exchange(a, b);
  expect(a.db.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(2);
  expect(b.db.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(2);
  expect(await readCycleRows(a.port)).toEqual(await readCycleRows(b.port));
});

it('delivers an older root as history without installing it over the current list', async () => {
  const [a, b] = await prepared();
  await open(a);
  const old = rootId(a);
  await open(a, '2026-10-27T08:00:00.000Z');
  await exchange(a, b);
  const before = await readDailyFlow(b.port);
  const rows = await readCycleRows(b.port);
  await withSnapshot(a, old, async files => {
    expect(files.dailyFlow.begin?.purpose).toBe('root_history');
    expect(files.dailyFlow.begin?.memberCount).toBe(0);
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, old, b.name));
  });
  expect(rootId(b)).toBe(rootId(a));
  expect((await readDailyFlow(b.port))!.session).toEqual(before!.session);
  expect(await readCycleRows(b.port)).toEqual(rows);
});

it('repairs a same-identity incomplete marker and sends subsequent operations without the current table', async () => {
  const [a, b] = await prepared();
  const session = await open(a);
  const id = rootId(a);
  await exchange(a, b);
  b.db.prepare('UPDATE daily_flow_lists SET complete=0 WHERE list_id=?').run(id);
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(a.port), remote: await readFramedSyncInventory(b.port) });
  expect(differences.some(value => value.globalId === id && value.direction === 'local_to_remote')).toBe(true);
  await exchange(a, b);
  expect(b.db.prepare('SELECT complete FROM daily_flow_lists WHERE list_id=?').pluck().get(id)).toBe(1);
  await act(a, session, 'grade', '2026-10-26T08:01:00.000Z');
  const after = compareFramedSyncInventories({ local: await readFramedSyncInventory(a.port), remote: await readFramedSyncInventory(b.port) });
  const flow = after.filter(value => value.objectType === 'daily_flow');
  expect(flow).toHaveLength(1);
  expect(flow[0]!.globalId).not.toBe(id);
  await withSnapshot(a, flow[0]!.globalId, async files => {
    expect(files.dailyFlow.begin).toMatchObject({ purpose: 'operation', memberCount: 0, sessionJson: '' });
  });
  await exchange(a, b);
  expect((await open(b, '2026-10-26T08:01:00.000Z')).reviewedItemCount).toBe(1);
});

it('rolls back the entire table and facts on an install failure and safely retries', async () => {
  const [a, b] = await prepared();
  await open(a);
  const id = rootId(a);
  const learning = b.db.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  await withSnapshot(a, id, async files => {
    b.db.exec("CREATE TRIGGER reject_table BEFORE INSERT ON daily_flow_entries BEGIN SELECT RAISE(ABORT, 'interrupted'); END");
    await expect(b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name))).rejects.toThrow('interrupted');
    for (const table of ['daily_flow_entries', 'daily_flow_sync_facts', 'daily_flow_fact_rows', 'daily_flow_lists', 'daily_flow_projection_facts']) {
      expect(b.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(b.db.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(learning);
    b.db.exec('DROP TRIGGER reject_table');
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
    expect(await readCycleRows(b.port)).toEqual(await readCycleRows(a.port));
    expect(b.db.prepare('SELECT count(*) FROM daily_flow_sync_facts').pluck().get()).toBe(1);
    expect((await readDailyFlow(b.port))!.session.currentNodeId).toBe((await readDailyFlow(a.port))!.session.currentNodeId);
  });
});

it.each([false, true])('qualifies against a newer local deletion before %s merged installation', async fork => {
  const [a, b] = await prepared();
  const source = await open(a);
  if (fork) await open(b, '2026-10-26T08:00:01.000Z');
  const id = rootId(a);
  await withSnapshot(a, id, async files => {
    softDeleteNodes(b.driver, { nodeIds: [source.currentNodeId!], deletedAt: '2026-10-26T08:00:02.000Z' });
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
  });
  const stored = (await readDailyFlow(b.port))!;
  expect(stored.session.currentNodeId).not.toBe(source.currentNodeId);
  expect((await readCycleRows(b.port, [source.currentNodeId!]))[0]!.active).toBe(0);
  expect(b.db.prepare('SELECT deleted_at FROM nodes WHERE id=?').pluck().get(source.currentNodeId))
    .toBe('2026-10-26T08:00:02.000Z');
});

it('rejects a changed row even when the transport digest is recomputed, without persisting a partial list', async () => {
  const [a, b] = await prepared();
  await open(a);
  const id = rootId(a);
  await withSnapshot(a, id, async source => {
    const files = createDesktopFramedSyncFiles(path.join(root, crypto.randomUUID()));
    await withRequestSyncFiles(files, async received => {
      const hash = sha256.create();
      let changed = false;
      for await (const message of source.dailyFlow.messages()) {
        const payload = structuredClone(message.payload) as Record<string, unknown>;
        if (message.payloadCase === 'daily_flow_table_end') {
          await received.dailyFlow.accept({ ...message, payload: { ...payload, tableHash: hash.digest() } });
          continue;
        }
        if (message.payloadCase === 'daily_flow_table_batch' && !changed) {
          for (const record of payload.records as { row?: { nodeId: string } }[]) if (record.row) {
            record.row.nodeId = 'corrupted'; changed = true; break;
          }
        }
        hash.update(encodeValidatedProtocolMessage(message.payloadCase, payload));
        await received.dailyFlow.accept({ ...message, payload });
      }
      expect(changed).toBe(true);
      await expect(b.port.transaction(tx => applyDailyFlowTable(tx, received.dailyFlow, id, b.name)))
        .rejects.toThrow('daily_flow_table_fact_hash_invalid');
      expect(await readCycleRows(b.port)).toEqual([]);
      expect(b.db.prepare('SELECT count(*) FROM daily_flow_sync_facts').pluck().get()).toBe(0);
    });
    await expect(b.port.transaction(tx => applyDailyFlowTable(tx, source.dailyFlow, id, b.name, new Uint8Array(32))))
      .rejects.toThrow('daily_flow_table_source_hash_invalid');
    expect(await readCycleRows(b.port)).toEqual([]);
  });
});

it('uses the existing reading conflict order when a newer local reading has an older write timestamp', async () => {
  const [a, b] = await setupPeers();
  node(a, 'topic', 'topic'); node(a, 'other', 'topic');
  await exchange(a, b);
  const source = await open(a);
  const id = source.currentNodeId!;
  const reading = (stamp: string) => ({ intervalDurationMs: 60_000, intervalGrowthFactor: 1,
    lastHandledAt: stamp, nextAt: '2026-10-27T08:00:00.000Z', priority: 0, readingPosition: 0,
    repetitionCount: 1, state: 'active' as const });
  try {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-29T08:00:00.000Z');
    await persistence.reading(b.port, { nodeId: id, before: null, after: reading('2026-10-26T08:02:00.000Z') }, '2026-10-26T08:02:00.000Z');
    vi.setSystemTime('2026-10-29T08:01:00.000Z');
    await persistence.reading(a.port, { nodeId: id, before: null, after: reading('2026-10-26T08:01:00.000Z') }, '2026-10-26T08:01:00.000Z');
  } finally { vi.useRealTimers(); }
  const expected = b.db.prepare('SELECT * FROM node_reading WHERE node_id=?').get(id);
  await withSnapshot(a, rootId(a), async files => {
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, rootId(a), b.name));
  });
  expect(b.db.prepare('SELECT * FROM node_reading WHERE node_id=?').get(id)).toEqual(expected);
  expect((await readDailyFlow(b.port))!.session.currentNodeId).not.toBe(id);
});
