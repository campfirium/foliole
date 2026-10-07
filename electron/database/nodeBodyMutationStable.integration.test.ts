// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { textDevice } from './topicTextState.testSupport.js';

const now = '2026-10-07T00:00:00.000Z';

it('creates special roots, edits parent content and flushes the same persisted version identities using stable bodies', async () => {
  const old = textDevice(); const stable = textDevice();
  try {
    for (const host of [old, stable]) {
      host.sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', 'host', ?)").run(now);
    }
    await stable.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
    });
    stable.sqlite.exec('DROP TABLE content_blob_data');
    const oldDriver = createBetterSqlite3Driver(old.sqlite);
    const driver = createBetterSqlite3Driver(stable.sqlite);
    const input = { anchorLink: null, content: '---\nsource: Original\n---\nBody', createdAt: now,
      hostName: 'host', isTitleManual: true, kind: 'topic' as const, nodeId: 'article',
      parentNodeId: 'special-inbox', position: null, reveal: null, title: 'Article', updatedAt: now };
    upsertNodeSnapshot(oldDriver, input, { searchInvalidation: { workspaceInvalidation: 'defer' } });
    upsertNodeSnapshot(driver, input, { bodyStorage: 'chunked', searchInvalidation: { workspaceInvalidation: 'defer' } });
    expect(loadNodeBodyResolution(driver, 'special-inbox', 'chunked'))
      .toMatchObject({ content: '', source: 'blob', status: 'resolved' });
    for (const [source, storage] of [[oldDriver, 'continuous'], [driver, 'chunked']] as const) {
      expect(flushNodeSyncVersionWithDriver(source, 'article', 'host', now, 'first', storage)).toBe('first');
    }
    const change = { nextContent: '---\nsource: Changed\n---\n' + '中😀\0'.repeat(250000),
      nodeId: 'article', updatedAt: '2026-10-07T01:00:00.000Z' };
    expect(applyParentContentChange({ ...change, driver, bodyStorage: 'chunked' }))
      .toEqual(applyParentContentChange({ ...change, driver: oldDriver }));
    expect(loadNodeBodyResolution(driver, 'article', 'chunked'))
      .toMatchObject({ content: change.nextContent, source: 'blob', status: 'resolved' });
    expect(driver.queryOne("SELECT content FROM nodes WHERE id = 'article'")).toEqual({ content: '' });
    for (const [source, storage] of [[oldDriver, 'continuous'], [driver, 'chunked']] as const) {
      expect(flushNodeSyncVersionWithDriver(source, 'article', 'host', change.updatedAt, 'second', storage)).toBe('second');
    }
    for (const sql of ['SELECT current_version_id, sync_dirty, opening_text, updated_at FROM nodes ORDER BY id',
      'SELECT version_id, object_id, content_hash FROM node_sync_versions ORDER BY version_id',
      'SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal']) {
      expect(driver.queryAll(sql)).toEqual(oldDriver.queryAll(sql));
    }
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});
