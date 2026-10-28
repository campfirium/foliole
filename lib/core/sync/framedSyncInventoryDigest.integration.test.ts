// @vitest-environment node
import path from 'node:path';

import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../electron/sync/desktopFramedSyncFiles.js';
import { migrateCompanionDatabase } from '../database/companionDatabaseMigrationExecutor.js';
import { applyNumberedSchemaMigrations } from '../database/numberedMigrations.js';

import type { DbParams, DbPort, DbRow } from './dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { expandRequestSyncNodeSummaries, flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from './framedSyncInventoryDigest.js';
import { readFramedSyncInventory } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { respondRequestSyncDatabase } from './requestSyncDatabaseResponse.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';
import { beginSyncGroupLocalAdoption } from './syncGroupLocalAdoption.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';

it('keeps narrow digests equal to full summaries after edits, invalidation and rebuilding', async () => {
  const host = textDevice();
  try {
    const first = await host.receive([textBranch('first', 'First body')]);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(framedSyncInventorySummary(await readFramedSyncInventory(host.db)));
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_node_digest').pluck().get()).toBe(1);
    await host.receive([textBranch('second', 'Second body', first)]);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_node_digest').pluck().get()).toBe(0);
    // A writer may invalidate between the flush and opening the read snapshot.
    const accurate = framedSyncInventorySummary(await readFramedSyncInventory(host.db));
    expect(await readRequestSyncInventorySummaries(host.db, ['topic', 'absent', 'topic']))
      .toEqual(accurate.filter(entry => entry.objectType === 'node' && entry.globalId === 'topic'));
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(accurate);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(accurate);
    host.sqlite.exec('DELETE FROM framed_sync_node_digest');
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(accurate);
  } finally { host.sqlite.close(); }
});

it.each(['desktop', 'companion'] as const)('upgrades the %s digest projection without changing stored facts', async platform => {
  const host = textDevice();
  try {
    await host.receive([textBranch('original', 'Preserved body')]);
    const before = await readFramedSyncInventory(host.db);
    const names = host.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_framed_digest_%'").pluck().all();
    for (const name of names) {
      if (typeof name !== 'string' || !/^trg_framed_digest_[a-z_]+$/u.test(name)) throw new Error('invalid_trigger');
      host.sqlite.exec(`DROP TRIGGER ${name}`);
    }
    host.sqlite.exec('DROP TABLE framed_sync_node_digest');
    if (platform === 'desktop') {
      // Exercise the registered digest migration, without replaying unrelated migrations on a fresh schema.
      applyNumberedSchemaMigrations({ currentVersion: 156, targetVersion: 157, sqlite: host.sqlite,
        legacyMessage: 'unsupported_fixture', setUserVersion: version => { host.sqlite.pragma(`user_version = ${version}`); } });
    } else await host.db.transaction(db => migrateCompanionDatabase(db, 85, 86));
    expect(await readFramedSyncInventory(host.db)).toEqual(before);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    expect(await readRequestSyncInventorySummaries(host.db)).toEqual(framedSyncInventorySummary(before));
    expect(host.sqlite.pragma('user_version', { simple: true })).toBe(platform === 'desktop' ? 157 : 86);
  } finally { host.sqlite.close(); }
});


it('rejects a corrupt digest within the same read snapshot', async () => {
  const host = textDevice();
  try {
    await host.receive([textBranch('version', 'Body')]);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    host.sqlite.prepare('UPDATE framed_sync_node_digest SET shared_state_hash = ?').run('0'.repeat(64));
    await expect(host.db.transaction(async db => {
      const summaries = await readRequestSyncInventorySummaries(db, ['topic']);
      return expandRequestSyncNodeSummaries(db, summaries, ['topic']);
    })).rejects.toThrow('framed_sync_source_changed');
  } finally { host.sqlite.close(); }
});


it('expands 500 requested details with one query in the caller transaction', async () => {
  const host = textDevice();
  try {
    const records = Array.from({ length: 500 }, (_, index) => {
      const id = `node-${index}`;
      const record = textBranch(`version-${index}`, `Body ${index}`);
      return { ...record, object_id: id, snapshot: { ...record.snapshot, id } };
    });
    await applyConvergentSyncNodesWithDbPort(host.db, records);
    const full = await readFramedSyncInventory(host.db);
    const summaries = framedSyncInventorySummary(full);
    const ids = records.map(record => record.object_id);
    await host.db.transaction(async db => {
      let queries = 0;
      const counted = (port: DbPort): DbPort => ({
        run: (sql, params) => port.run(sql, params),
        query: (sql, params) => { queries += 1; return port.query(sql, params); },
        transaction: execute => port.transaction(tx => execute(counted(tx)))
      });
      const expanded = await expandRequestSyncNodeSummaries(counted(db), summaries, [...ids, ids[0]!]);
      expect(expanded).toEqual(full);
      expect(queries).toBe(1);
      queries = 0;
      expect(await expandRequestSyncNodeSummaries(counted(db), summaries, [])).toEqual(summaries);
      expect(queries).toBe(0);
    });
  } finally { host.sqlite.close(); }
});

it.each(['hash', 'unready', 'missing'] as const)('rejects %s detail changes in the caller snapshot', async change => {
  const host = textDevice();
  try {
    await host.receive([textBranch('version', 'Body')]);
    const summaries = framedSyncInventorySummary(await readFramedSyncInventory(host.db));
    if (change === 'hash') summaries[0] = { ...summaries[0]!, sharedStateHash: new Uint8Array(32) };
    if (change === 'unready') summaries[0] = { ...summaries[0]!, unready: !summaries[0]!.unready };
    if (change === 'missing') host.sqlite.exec('DELETE FROM framed_sync_inventory');
    await expect(host.db.transaction(db => expandRequestSyncNodeSummaries(db, summaries, ['topic'])))
      .rejects.toThrow('framed_sync_source_changed');
  } finally { host.sqlite.close(); }
});


it.each([10, 200])('reads only requested detail identities beside %s unrelated nodes', async count => {
  const host = textDevice();
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'local', initiatorLibraryEpoch: 'local-epoch',
    responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' } as const;
  const auth = { context, groupKey: new Uint8Array(32).fill(7) };
  try {
    await host.receive([textBranch('target-version', 'Target body')]);
    await applyConvergentSyncNodesWithDbPort(host.db, Array.from({ length: count }, (_, index) => {
      const record = textBranch(`version-${index}`, `Body ${index}`);
      const id = `unrelated-${index}`;
      return { ...record, object_id: id, snapshot: { ...record.snapshot, id } };
    }));
    const expected = (await readFramedSyncInventory(host.db)).filter(entry => entry.globalId === 'topic');
    for (const warm of [false, true]) {
      if (warm) await host.db.transaction(flushRequestSyncInventoryDigests);
      const unrelated = new Set<string>();
      const counted = (port: DbPort): DbPort => ({
        run: (sql, params) => port.run(sql, params),
        async query<T extends DbRow>(sql: string, params?: DbParams) {
          const rows = await port.query<T>(sql, params);
          for (const row of rows) if (typeof row.object_id === 'string' && row.object_id !== 'topic') {
            unrelated.add(row.object_id);
          }
          return rows;
        },
        transaction: execute => port.transaction(tx => execute(counted(tx)))
      });
      const request = await prepareRequestSyncWire({ ...auth, messages: async function* () {
        yield* iterateRequestSyncInventory({ entries: [], roundId: new Uint8Array(16).fill(1),
          detailGlobalIds: ['topic', 'absent'] });
      } });
      try {
        const result = await respondRequestSyncDatabase({
          files: createDesktopFramedSyncFiles(path.resolve('.tmp/artifacts/T562/files')),
          write: execute => host.db.transaction(db => execute(counted(db))),
          readSnapshot: execute => host.db.transaction(db => execute(counted(db)))
        }, { ...auth, stream: request, mode: 'inventory' }, async response =>
          decodeRequestSyncInventory((async function* () {
            for await (const decoded of readRequestSyncWire({ ...auth, ...response })) yield decoded.message;
          })()));
        expect(result.entries).toEqual(expected);
        expect([...unrelated]).toEqual([]);
      } finally { await request.frames.return(undefined); }
    }
  } finally { host.sqlite.close(); }
});


it('withholds requested summaries while local adoption blocks publication', async () => {
  const host = textDevice();
  try {
    await host.receive([textBranch('version', 'Body')]);
    await host.db.transaction(flushRequestSyncInventoryDigests);
    await beginSyncGroupLocalAdoption(host.db, { endpointUrl: 'http://127.0.0.1:38641', groupId: 'group',
      libraryEpoch: 'incoming', providerDeviceId: 'provider', providerDeviceName: 'Provider', providerPlatform: 'macos' });
    expect(await readRequestSyncInventorySummaries(host.db, ['topic'])).toEqual([]);
  } finally { host.sqlite.close(); }
});
