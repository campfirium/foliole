// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';


function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-native-facts-'));
  const sourcePath = path.join(root, 'source.db');
  const source = new Database(sourcePath);
  const pack = new Database(':memory:');
  for (const sql of definitions.packSchema) source.exec(sql);
  source.exec(`CREATE TABLE sync_identity_node_facts (node_id TEXT, digest TEXT);
    INSERT INTO sync_identity_node_facts VALUES ('child', 'digest')`);
  for (const sql of definitions.packSchema) pack.exec(sql);
  pack.exec(`CREATE TEMP TABLE selected_identity_objects (object_type TEXT, object_id TEXT);
    INSERT INTO selected_identity_objects VALUES ('node', 'child');
    CREATE TEMP TABLE selected_identity_fact (after_key TEXT, page_limit INTEGER, fact_digest TEXT, chunk_offset INTEGER DEFAULT 0);
    INSERT INTO selected_identity_fact (after_key, page_limit, fact_digest) VALUES (NULL, 64, 'digest')`);
  pack.prepare('ATTACH DATABASE ? AS source').run(sourcePath);
  return { source, pack, close: () => {
    pack.close(); source.close(); fs.rmSync(root, { force: true, recursive: true });
  } };
}

it('transfers every original version with bounded row and byte pages without adopting a node', () => {
  const { source, pack, close } = fixture();
  try {
    expect(pack.prepare(definitions.identityFactValidateSql).pluck().get()).toBe(1);
    pack.exec("UPDATE selected_identity_fact SET fact_digest = 'wrong'");
    expect(pack.prepare(definitions.identityFactValidateSql).pluck().get()).toBe(0);
    pack.exec("UPDATE selected_identity_fact SET fact_digest = 'digest'");
    const insert = source.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (let index = 0; index < 130; index += 1) {
      insert.run(`v${String(index).padStart(4, '0')}`, 'child', null, 'host', 'now', 'hash', 'x'.repeat(35000), '{}');
    }
    const plan = definitions.identityFactPlans[0]!;
    const seen: string[] = [];
    let next: unknown;
    do {
      pack.exec('DELETE FROM node_sync_versions');
      expect(pack.prepare(plan.preflightSql).pluck().get()).toBeLessThan(2097152);
      pack.exec(plan.copySql);
      const rows = pack.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').pluck().all() as string[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(64);
      seen.push(...rows);
      next = pack.prepare(plan.tailSql).pluck().get();
      if (next === null) break;
      pack.prepare('UPDATE selected_identity_fact SET after_key = ?').run(next);
    } while (next !== null);
    expect(seen).toEqual(Array.from({ length: 130 }, (_, index) => `v${String(index).padStart(4, '0')}`));
    expect(pack.prepare('SELECT COUNT(*) FROM nodes').pluck().get()).toBe(0);
    source.prepare('UPDATE node_sync_versions SET body_text = ?').run('x'.repeat(2097153));
    pack.exec('UPDATE selected_identity_fact SET after_key = NULL');
    expect(pack.prepare(plan.preflightSql).pluck().get()).toBeGreaterThan(2097152);
  } finally { close(); }
});

it('uses the original parent edge tuple as the continuation cursor', () => {
  const { source, pack, close } = fixture();
  try {
    source.exec(`INSERT INTO node_sync_versions VALUES ('v', 'child', NULL, 'host', 'now', 'hash', '', '{}');
      INSERT INTO node_sync_version_parents VALUES ('v', 'a', 0), ('v', 'b', 1), ('v', 'c', 2)`);
    pack.exec('UPDATE selected_identity_fact SET page_limit = 2');
    const plan = definitions.identityFactPlans[1]!;
    pack.exec(plan.copySql);
    expect(pack.prepare(plan.tailSql).pluck().get()).toBe('["v",1,"b"]');
    pack.exec('DELETE FROM node_sync_version_parents');
    pack.prepare('UPDATE selected_identity_fact SET after_key = ?').run('["v",1,"b"]');
    pack.exec(plan.copySql);
    expect(pack.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([
      { version_id: 'v', parent_version_id: 'c', ordinal: 2 }
    ]);
    expect(pack.prepare(plan.tailSql).pluck().get()).toBeNull();
  } finally { close(); }
});


it('copies a giant original row as exact fixed byte slices without loading it into the head', () => {
  const { source, pack, close } = fixture();
  try {
    const body = '中😀'.repeat(460_000);
    source.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('giant', 'child', null, 'host', 'now', 'hash', body, '{}');
    const plan = definitions.identityFactPlans[0]!;
    const metadata = pack.prepare(plan.metadataSql).get() as { fact_key: string; total: number };
    expect(metadata.fact_key).toBe('giant');
    const slices: Buffer[] = [];
    for (let offset = 0; offset < metadata.total; offset += 262144) {
      pack.prepare('UPDATE selected_identity_fact SET chunk_offset = ?').run(offset);
      const row = pack.prepare(plan.chunkSql).get() as { data: Buffer };
      expect(row.data.byteLength).toBe(Math.min(262144, metadata.total - offset));
      slices.push(row.data);
    }
    expect(slices.some((slice) => {
      try { new TextDecoder('utf8', { fatal: true }).decode(slice); return false; }
      catch { return true; }
    })).toBe(true);
    const original = JSON.parse(Buffer.concat(slices).toString('utf8')) as { body_text: string };
    expect(original.body_text === body).toBe(true);
    pack.exec(definitions.identityFactHeadCopySql);
    expect(pack.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(0);
  } finally { close(); }
});


it('rejects an original tombstone head absent from the source version facts', () => {
  const { source, pack, close } = fixture();
  try {
    source.exec("INSERT INTO node_sync_tombstones VALUES ('child', 'lost', NULL, 'host', 'hash', '{}', 'now', 'now')");
    pack.exec("INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at) VALUES ('node', 'child', 0, 'hash', 'host', 'now', 'now')");
    expect(pack.prepare(definitions.identityMissingOriginalHeadSql).pluck().get()).toBe('lost');
    source.exec("INSERT INTO node_sync_versions VALUES ('lost', 'child', NULL, 'host', 'now', 'hash', 'original', '{}')");
    expect(pack.prepare(definitions.identityMissingOriginalHeadSql).get()).toBeUndefined();
  } finally { close(); }
});


it('uses the global UTF-8 type order for thin preludes while keeping selected node pages full', () => {
  const { pack, close } = fixture();
  try {
    for (const types of [[], ['node'], ['node', 'node_review'], ['node_review'],
      ['parent_child_order', 'order_version'], ['setting'], ['external_document'], ['Node'], ['节点']]) {
      pack.exec('DELETE FROM selected_identity_objects');
      for (const type of types) pack.prepare('INSERT INTO selected_identity_objects VALUES (?, ?)').run(type, type);
      expect(pack.prepare(definitions.identityThinPreludeSql).pluck().get()).toBe(
        types.length > 0 && types.every((type) => compareSyncIdentityText(type, 'node') > 0) ? 1 : 0);
    }
  } finally { close(); }
});
