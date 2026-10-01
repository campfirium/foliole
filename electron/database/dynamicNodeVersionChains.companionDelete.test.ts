// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applySyncPackNodeTombstonesWithDbPort } from '../../lib/core/sync/syncPackNodeTombstoneExecutor.js';
import { applySyncPackNodeVersionsWithDbPort } from '../../lib/core/sync/syncPackNodeVersionApplyExecutor.js';

import { copyPayloads } from './androidSyncPackProviderDefinitions.testSupport.js';
import { permanentlyDelete } from './dynamicNodeVersionChains.delete.testSupport.js';
import { buildPack, closeLibraries, createPeer, edit, history, joinPeers, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('copies a deleted object complete chain through the native provider SQL and shared apply with FK enabled', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'body');
  await buildPack(source, target);
  const tomb = permanentlyDelete(source);
  const frontier = source.db.prepare('SELECT high_water FROM sync_state_sequence').pluck().get() as number;
  const estimate = source.db.prepare(definitions.versionPreflightSql).get(0, frontier, 0, frontier) as { rows: number; bytes: number };
  expect(estimate.rows).toBe(2);
  expect(estimate.bytes).toBeGreaterThan(1024);
  const packPath = `${source.file}.deletion-pack`;
  const pack = new Database(packPath);
  try {
    for (const sql of definitions.packSchema) pack.exec(sql);
    pack.prepare('ATTACH DATABASE ? AS source').run(source.file);
    definitions.copyStatements.forEach((sql, index) => {
      if (index === definitions.stateCopyIndex) pack.prepare(sql).run(0, frontier);
      else {
        if (index === definitions.payloadCopyIndex) copyPayloads(pack);
        pack.exec(sql);
      }
    });
    expect(pack.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
    expect(pack.prepare('SELECT version_id FROM node_sync_versions ORDER BY created_at').pluck().all()).toEqual([base, tomb.version_id]);
    pack.exec('DETACH DATABASE source');
    target.db.prepare('ATTACH DATABASE ? AS inc').run(packPath);
    await target.port.transaction(async tx => {
      await applySyncPackNodeTombstonesWithDbPort(tx, 'inc', false);
      await applySyncPackNodeVersionsWithDbPort(tx);
      await collectNodeVersionPayloads(tx, 'topic');
    });
    expect(history(target).find(row => row.version_id === tomb.version_id)?.body_text).toBe('body');
    expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(target.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(target.db.pragma('foreign_key_check')).toEqual([]);
  } finally { pack.close(); target.db.exec('DETACH DATABASE inc'); }
});
