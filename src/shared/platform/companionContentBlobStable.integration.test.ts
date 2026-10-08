// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { afterEach, expect, it, vi } from 'vitest';

import { companionContentResourceQueryDefinition as queryDefinition } from '../../../lib/core/database/androidCompanionContentResourceQueryDefinitions.js';
import { hashTextBody } from '../../../lib/core/database/textBodyHash.js';

import { editableNode, stableEditingHost } from './companion/editing/companionContentEditingStable.testSupport.js';
import type { CapacitorCompanionDatabaseOwner } from './companion/runtime/capacitorCompanionDatabaseOwner.js';
import { materializeCompanionCurrentBodies } from './companion/runtime/companionCurrentVersionBodies.js';
import { loadCompanionMissingContentBlobBatch } from './companionContentBlobSync.js';

const state = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({})) }));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => state.owner
}));
let host: Awaited<ReturnType<typeof stableEditingHost>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; state.owner = null; });

async function fixture() {
  host = await stableEditingHost('ios');
  state.owner = host.owner;
  await host.seed(editableNode({ content: '' }), 'empty');
  await host.seed(editableNode({ id: 'large', content: '\ufeff中😀\0'.repeat(70_000) }), 'large');
  for (const row of host.sqlite.prepare('SELECT content FROM nodes').all() as Array<{ content: string }>) {
    missingBody(host, row.content);
  }
  return host;
}

function missingBody(host: Awaited<ReturnType<typeof fixture>>, body: string, availability = 'missing', nodeId?: string) {
  const hash = hashTextBody(body), bytes = Buffer.byteLength(body);
  host.sqlite.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression,
    original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
    VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, ?, 'now')`)
    .run(hash, `text/${hash}`, bytes, bytes, hash, hash, availability);
  if (nodeId) host.sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at)
    VALUES (?, 'topic', 'Missing', '', ?, 'now', 'now')`).run(nodeId, hash);
  return { hash, bytes };
}

it('materializes legacy caches from complete owned empty and Unicode bodies without changing versions', async () => {
  const host = await fixture();
  const hashes = host.sqlite.prepare('SELECT hash FROM content_blobs ORDER BY hash').pluck().all() as string[];
  const before = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const observed: string[] = [];
  const original = host.owner.runWriter.bind(host.owner);
  const spy = vi.spyOn(host.owner, 'runWriter').mockImplementation((task) => original((db) => task({ ...db,
    query: (sql, params) => { observed.push(sql); return db.query(sql, params); }
  })));
  try {
    expect(await materializeCompanionCurrentBodies(hashes)).toBe(2);
    expect(await loadCompanionMissingContentBlobBatch(1)).toMatchObject({ hashes: [], total: 0, totalBytes: 0 });
    expect(await materializeCompanionCurrentBodies(hashes)).toBe(0);
  } finally { spy.mockRestore(); }
  expect(observed.every((sql) => !sql.includes('content_body_chunks'))).toBe(true);
  expect(isDeepStrictEqual(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all(), before)).toBe(true);
  expect(host.sqlite.prepare("SELECT count(*) FROM content_blobs WHERE availability = 'cached'").pluck().get()).toBe(2);
  expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_bodies', 'content_body_chunks')").all()).toEqual([]);
});

it('preserves legacy cache demand priority, failed status, limit and summary', async () => {
  const host = await fixture();
  const active = missingBody(host, 'Active', 'failed', 'active');
  const root = missingBody(host, 'Root', 'missing', 'root');
  const failed = missingBody(host, 'Failed', 'failed');
  host.sqlite.prepare("INSERT INTO workspace_meta VALUES ('active_node_id', 'active', 'now')").run();
  const hashes = host.sqlite.prepare("SELECT hash FROM content_blobs WHERE hash NOT IN (?, ?, ?)")
    .pluck().all(active.hash, root.hash, failed.hash) as string[];
  expect(await materializeCompanionCurrentBodies(hashes)).toBe(2);
  const oldRows = host.sqlite.prepare(queryDefinition('contentBlobMissingHashes').sql).all(2);
  const oldSummary = host.sqlite.prepare(queryDefinition('contentBlobMissingSummaryRows').sql).all();
  const result = await loadCompanionMissingContentBlobBatch(2);
  expect(result.blobs).toEqual(oldRows);
  expect(result.hashes).toEqual([active.hash, root.hash]);
  expect(result).toMatchObject({ total: 3, totalBytes: active.bytes + root.bytes + failed.bytes,
    failedCount: 2, failedBytes: active.bytes + failed.bytes });
  expect(host.sqlite.prepare(queryDefinition('contentBlobMissingSummaryRows').sql).all()).toEqual(oldSummary);
  expect(host.sqlite.prepare(queryDefinition('contentBlobDataExisting').sql).get(root.hash)).toBeUndefined();
  expect(await materializeCompanionCurrentBodies([active.hash, root.hash])).toBe(0);
});

it('leaves contradictory legacy cache manifests missing without changing owned bodies or versions', async () => {
  const host = await fixture();
  const rows = host.sqlite.prepare('SELECT hash FROM content_blobs ORDER BY hash').pluck().all() as string[];
  const invalid = hashTextBody('');
  host.sqlite.prepare('UPDATE content_blobs SET stored_size_bytes = stored_size_bytes + 1 WHERE hash = ?').run(invalid);
  const before = host.sqlite.prepare('SELECT * FROM content_blobs ORDER BY hash').all();
  expect(await materializeCompanionCurrentBodies([invalid])).toBe(0);
  expect(host.sqlite.prepare('SELECT * FROM content_blobs ORDER BY hash').all()).toEqual(before);
  expect(host.sqlite.prepare(queryDefinition('contentBlobDataExisting').sql).get(invalid)).toBeUndefined();
  expect((await loadCompanionMissingContentBlobBatch(1)).hashes).toEqual([invalid]);
  expect(rows).toContain(invalid);
});
