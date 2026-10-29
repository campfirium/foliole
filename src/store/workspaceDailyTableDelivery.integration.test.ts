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
import { historyEntry, replayHistory } from '../test/dailyFlowHistorySync.testSupport.js';

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

it('receives an operation without replacing a local list advanced after capture', async () => {
  const [a, b] = await prepared();
  await act(a, await open(a), 'grade', '2026-10-26T08:01:00.000Z');
  const id = a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get() as string;
  await withSnapshot(a, id, async files => {
    expect(files.dailyFlow.begin).toMatchObject({ purpose: 'operation', memberCount: 0, sessionJson: '' });
    await act(b, await open(b), 'grade', '2026-10-26T08:02:00.000Z');
    const localHead = b.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get();
    const rows = await readCycleRows(b.port);
    const state = (await readDailyFlow(b.port))!.session;
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
    expect(b.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get()).toBe(localHead);
    expect(await readCycleRows(b.port)).toEqual(rows);
    expect((await readDailyFlow(b.port))!.session).toEqual(state);
    expect(b.db.prepare("SELECT count(*) FROM daily_flow_sync_facts WHERE id=?").pluck().get(id)).toBe(1);
  });
  await exchange(a, b);
  for (const peer of [a, b]) expect(peer.db.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(2);
});

it('does not publish old or current private list identities', async () => {
  const [a, b] = await prepared();
  await open(a);
  const old = rootId(a);
  await open(a, '2026-10-27T08:00:00.000Z');
  const current = rootId(a);
  expect(current).not.toBe(old);
  expect((await readFramedSyncInventory(a.port)).filter(entry => entry.objectType === 'daily_flow')).toEqual([]);
  await exchange(a, b);
  expect(await readDailyFlow(b.port)).toBeNull();
  expect(b.db.prepare('SELECT * FROM daily_flow_sync_facts').all()).toEqual([]);
});

it('rolls back a failed operation receive and safely retries without installing rows', async () => {
  const [a, b] = await prepared();
  await act(a, await open(a), 'grade');
  const id = a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get() as string;
  await withSnapshot(a, id, async files => {
    b.db.exec("CREATE TRIGGER reject_operation BEFORE INSERT ON daily_flow_sync_facts BEGIN SELECT RAISE(ABORT, 'interrupted'); END");
    await expect(b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name))).rejects.toThrow('interrupted');
    for (const table of ['daily_flow_entries', 'daily_flow_sync_facts', 'daily_flow_fact_rows', 'daily_flow_lists', 'daily_flow_projection_facts']) {
      expect(b.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    b.db.exec('DROP TRIGGER reject_operation');
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
    expect(await readCycleRows(b.port)).toEqual([]);
    expect(b.db.prepare('SELECT count(*) FROM daily_flow_sync_facts').pluck().get()).toBe(1);
    expect(await readDailyFlow(b.port)).toBeNull();
  });
});

it.each([false, true])('keeps a newer local deletion when receiving operations with existing list %s', async hasList => {
  const [a, b] = await prepared();
  const source = await open(a);
  if (hasList) await open(b);
  await act(a, source, 'grade');
  const id = a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get() as string;
  await withSnapshot(a, id, async files => {
    softDeleteNodes(b.driver, { nodeIds: [source.currentNodeId!], deletedAt: '2026-10-26T08:00:02.000Z' });
    await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name));
  });
  expect((await open(b)).currentNodeId).not.toBe(source.currentNodeId);
  expect(b.db.prepare('SELECT deleted_at FROM nodes WHERE id=?').pluck().get(source.currentNodeId))
    .toBe('2026-10-26T08:00:02.000Z');
});

it('rejects a changed row even when the transport digest is recomputed, without persisting a partial list', async () => {
  const [a, b] = await prepared();
  await act(a, await open(a), 'grade');
  const id = a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get() as string;
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
  await exchange(a, b);
  expect(b.db.prepare('SELECT * FROM node_reading WHERE node_id=?').get(id)).toEqual(expected);
  expect((await open(b)).currentNodeId).not.toBe(id);
});

it('resolves a received undo when its target arrives later without temporarily counting it twice', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b']) node(a, id, 'topic');
  await exchange(a, b);
  await open(b);
  const before = await readCycleRows(b.port);
  const entry = await historyEntry(a, 'a', 'soon', '2026-10-26T08:01:00.000Z');
  await replayHistory(a, await open(a), entry, 'undo', '2026-10-26T08:02:00.000Z');
  const undoId = a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get() as string;
  for (const id of [undoId, entry.id]) {
    await withSnapshot(a, id, files => b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name)));
    expect((await open(b)).readTopicCount).toBe(0);
    expect(await readCycleRows(b.port)).toEqual(before);
  }
});
