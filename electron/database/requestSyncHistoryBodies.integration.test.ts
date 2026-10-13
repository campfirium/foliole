// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const bodyBytes = 1_048_533;
const versionCount = 15;

function history() {
  const records: NativeSyncNodeRecord[] = [];
  for (let index = 0; index < versionCount; index++) {
    const prefix = `Version ${index}: \uFEFF中😀\0\r\n`;
    records.push(textBranch(`history-${index}`, prefix + 'x'.repeat(bodyBytes - Buffer.byteLength(prefix)),
      records.at(-1), new Date(Date.UTC(2026, 9, 10, 0, 0, index)).toISOString()));
  }
  return records;
}

function versions(sqlite: Database.Database) {
  return sqlite.prepare(`SELECT version_id, parent_version_id, content_hash, body_text
    FROM node_sync_versions ORDER BY version_id`).all();
}

function businessState(sqlite: Database.Database) {
  return Object.fromEntries(['nodes', 'node_sync_versions', 'node_sync_version_parents',
    'sync_object_state', 'content_blobs'].map(table => [table,
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

async function fixture(records = history()) {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/request-history-'));
  const source = textDevice();
  await applySyncNodesWithDbPort(source.db, records);
  const file = path.join(root, 'companion.db');
  let sqlite = new Database(file);
  await bootstrapCompanionDatabase(createBetterSqliteDbPort(sqlite), {
    allowCreate: true, expectedHostName: 'receiver', now: '2026-10-10'
  });
  return { source, records, files: createDesktopFramedSyncFiles(root),
    get sqlite() { return sqlite; },
    reopen() { sqlite.close(); sqlite = new Database(file); },
    async close() { sqlite.close(); source.sqlite.close(); await rm(root, { recursive: true, force: true }); }
  };
}

function assertHistory(host: Awaited<ReturnType<typeof fixture>>) {
  expect(versions(host.sqlite)).toEqual(versions(host.source.sqlite));
  expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all())
    .toEqual(host.source.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all());
  expect(host.sqlite.prepare('SELECT content, current_version_id FROM nodes WHERE id = \'topic\'').all()).toEqual([
    { content: host.records.at(-1)!.body_text, current_version_id: host.records.at(-1)!.version_id }
  ]);
  expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_receipts'").get()).toBeUndefined();
}

it.each(['ordered', 'child-first', 'corrupt-final'] as const)(
  'preserves fifteen complete large bodies across reopening: %s', async order => {
  const corrupt = order === 'corrupt-final';
  const host = await fixture();
  try {
    const entry = await readFramedSyncInventoryEntry(host.source.db, { objectType: 'node', globalId: 'topic' });
    if (!entry) throw new Error('history_inventory_missing');
    const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
    if (!difference) throw new Error('history_difference_missing');
    const originalNodes = host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
    await withRequestSyncFiles(host.files, async request => {
      await writeRequestSyncSnapshot(host.source.db, difference, request);
      const facts: CanonicalFact[] = [];
      for await (const fact of request.readFacts()) facts.push(fact);
      const nodeFacts = facts.filter(fact => fact.kind === 2);
      expect(nodeFacts).toHaveLength(versionCount);
      const finalBlob = nodeFacts.at(-1)!.blobs[0]!;
      if (order === 'child-first') facts.reverse();
      const key = `${request.directory}/body-${bytesToHex(finalBlob.sha256)}-0`;
      const original = await host.files.read(key);
      if (!original) throw new Error('final_history_chunk_not_spooled');
      if (corrupt) await host.files.write(key, new Uint8Array(original.length).fill(120));
      let readBytes = 0;
      const apply = () => applyFramedFactSources(createBetterSqliteDbPort(host.sqlite), [async function* () {
        yield* facts;
      }], { requireCompleteVersionGraph: true, loadBody: async (_db, blob) => {
        const body = await request.loadBody(blob); readBytes += body.byteLength; return body;
      } });
      if (corrupt) {
        await expect(apply()).rejects.toThrow('request_sync_body_digest_mismatch');
        expect(readBytes).toBeGreaterThan(0);
        expect(versions(host.sqlite)).toEqual([]);
        expect(host.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(originalNodes);
        expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
        host.reopen();
        expect(versions(host.sqlite)).toEqual([]);
        await host.files.write(key, original);
        readBytes = 0;
      }
      await apply();
      expect(readBytes).toBeLessThanOrEqual((versionCount + 1) * bodyBytes);
      assertHistory(host);
      host.reopen();
      assertHistory(host);
      facts.reverse();
      await apply();
      assertHistory(host);
    });
    expect(await host.files.list('requests')).toEqual([]);
    host.reopen();
    assertHistory(host);
  } finally { await host.close(); }
}, 120_000);


it.each(['', '\uFEFF---\r\nkey: 中文😀\0\r\n---\r\n' + '中😀'.repeat(100_000)])(
  'owns the exact body and original version hash after request cleanup (%#)', async body => {
    const record = { ...textBranch('original-version', body), content_hash: '4'.repeat(64) };
    const host = await fixture([record]);
    try {
      const entry = await readFramedSyncInventoryEntry(host.source.db, { objectType: 'node', globalId: 'topic' });
      if (!entry) throw new Error('body_inventory_missing');
      const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
      if (!difference) throw new Error('body_difference_missing');
      await withRequestSyncFiles(host.files, async request => {
        await writeRequestSyncSnapshot(host.source.db, difference, request);
        const apply = (invalid = false) => applyFramedFactSources(createBetterSqliteDbPort(host.sqlite),
          [() => request.readFacts()], { requireCompleteVersionGraph: true,
            loadBody: async (_db, blob) => invalid ? new TextEncoder().encode('Altered!') : request.loadBody(blob) });
        const empty = businessState(host.sqlite);
        await expect(apply(true)).rejects.toThrow();
        expect(businessState(host.sqlite)).toEqual(empty);
        await apply();
        const before = businessState(host.sqlite);
        await expect(apply(true)).rejects.toThrow();
        expect(businessState(host.sqlite)).toEqual(before);
        assertHistory(host);
        host.reopen();
        await apply();
        assertHistory(host);
      });
      expect(await host.files.list('requests')).toEqual([]);
      host.reopen();
      assertHistory(host);
      expect(host.sqlite.prepare('SELECT content, body_blob_hash, current_version_id FROM nodes WHERE id = ?')
        .get('topic')).toEqual({ content: body, body_blob_hash: hashTextBody(body), current_version_id: 'original-version' });
      expect(versions(host.sqlite)).toEqual([{ version_id: 'original-version', parent_version_id: null,
        content_hash: '4'.repeat(64), body_text: body }]);
      expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('settings', 'search_index_invalidations')").all())
        .toEqual([]);
    } finally { await host.close(); }
  });
