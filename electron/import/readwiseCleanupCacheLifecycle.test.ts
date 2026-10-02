// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let stateRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(stateRoot, 'cache'),
    app_config_dir: path.join(stateRoot, 'config'),
    app_data_dir: stateRoot,
    app_log_dir: path.join(stateRoot, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { upsertKeepImportItemCache } from '../database/keepImportItemCache.js';
import { upsertKeepImportItem } from '../database/keepImportItems.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadRemovedSources } from '../ipc/removedSourcesPayload.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { refreshKeepImportItemCache } from './keepImportItemCacheRefresh.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { clearReadwiseTracking } from './readwiseImportCleanupTracking.js';

let root = '';
const RULE = 'cleanup-readwise';
const AT = '2026-10-02T00:00:00.000Z';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-cleanup-cache-'));
  stateRoot = path.join(root, 'state');
  initializeDatabase();
  const primaryPath = path.join(root, 'readwise', 'Full Document Contents', 'Articles');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.writeFile(path.join(primaryPath, 'sample.md'), '# Sample\nFresh source body.');
  saveImportManagerSettings({
    readwiseRootPath: path.join(root, 'readwise'),
    readwiseSources: [{
      highlightMode: 'split', highlightPath: '', id: RULE,
      keepState: 'enabled', kind: 'articles', primaryPath
    }]
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function seed(ruleId: string, sourcePath: string, nodeId: string | null = null, missing = false) {
  upsertKeepImportItem({
    firstSeenAt: AT, lastSeenAt: AT, lastImportedAt: AT, lastNodeId: nodeId, hasSourceUpdate: false,
    lastStatus: 'blocked_deleted', localNodeState: 'locally_deleted', ruleId,
    sourceMtimeMs: 1, sourcePath, sourceSizeBytes: 1,
    sourceState: missing ? 'missing' : 'present'
  });
  upsertKeepImportItemCache({
    content: 'Previous cached body.', contentPreview: 'Previous preview.', refreshedAt: AT,
    ruleId, sourceMtimeMs: 1, sourcePath, sourceSizeBytes: 1, title: 'Previous title'
  });
}

function snapshot() {
  const db = openDatabaseConnection().sqlite;
  return {
    cache: db.prepare('SELECT * FROM keep_import_item_cache ORDER BY rule_id, source_path').all(),
    tracking: db.prepare('SELECT * FROM keep_import_items ORDER BY rule_id, source_path').all()
  };
}

it('deletes only caches paired with the tracking selected by cleanup', () => {
  seed(RULE, 'tracking-only.md');
  seed(RULE, 'detached.md', 'detached');
  seed(RULE, 'deleted.md', 'deleted');
  seed(RULE, 'missing.md', 'retained', true);
  seed('other-rule', 'tracking-only.md');
  seed('other-rule', 'detached.md', 'retained');
  seed(RULE, 'historical-orphan.md');
  openDatabaseConnection().sqlite.prepare('DELETE FROM keep_import_items WHERE source_path = ?').run('historical-orphan.md');
  const before = snapshot();
  const retained = (row: unknown) => {
    const item = row as { rule_id: string; source_path: string };
    return item.rule_id !== RULE || !['tracking-only.md', 'detached.md'].includes(item.source_path);
  };
  clearReadwiseTracking({ deletedNodeIds: ['deleted'], detachedNodeIds: ['detached'] });
  expect(snapshot()).toEqual({
    cache: before.cache.filter(retained), tracking: before.tracking.filter(retained)
  });
  closeDatabaseConnection();
  expect(snapshot()).toEqual({
    cache: before.cache.filter(retained), tracking: before.tracking.filter(retained)
  });
});

it.each(['keep_import_items', 'keep_import_item_cache'])('rolls back both sides when %s deletion fails', (table) => {
  seed(RULE, 'tracking-only.md');
  seed(RULE, 'detached.md', 'detached');
  const before = snapshot();
  openDatabaseConnection().sqlite.exec(`
    CREATE TRIGGER fixture_fail_delete BEFORE DELETE ON ${table}
    WHEN OLD.source_path = 'detached.md'
    BEGIN SELECT RAISE(ABORT, 'fixture_cleanup_failure'); END
  `);
  expect(() => clearReadwiseTracking({ deletedNodeIds: [], detachedNodeIds: ['detached'] }))
    .toThrow('fixture_cleanup_failure');
  expect(snapshot()).toEqual(before);
  closeDatabaseConnection();
  expect(snapshot()).toEqual(before);
});

it('does not revive cache when cleanup removes tracking during Removed loading', async () => {
  seed(RULE, 'sample.md');
  seed('other-rule', 'sample.md');
  const before = snapshot();
  const pending = loadRemovedSources();
  clearReadwiseTracking({ deletedNodeIds: [], detachedNodeIds: [] });
  await pending;
  const retainOther = (row: unknown) => (row as { rule_id: string }).rule_id === 'other-rule';
  expect(snapshot()).toEqual({
    cache: before.cache.filter(retainOther), tracking: before.tracking.filter(retainOther)
  });
  closeDatabaseConnection();
  expect(snapshot().cache).toEqual(before.cache.filter(retainOther));
});

it('refreshes a tracked Removed source without a node and retains unavailable source caches', async () => {
  seed(RULE, 'sample.md');
  seed(RULE, 'unavailable.md');
  seed(RULE, 'missing.md', null, true);
  const before = snapshot();
  const result = await loadRemovedSources();
  expect(result.entries.find((entry) => entry.source_path === 'sample.md')?.content).toContain('Fresh source body.');
  expect(result.entries.find((entry) => entry.source_path === 'unavailable.md')?.content).toBe('Previous cached body.');
  const after = snapshot();
  expect(after.tracking).toEqual(before.tracking);
  const unchanged = (row: unknown) => (row as { source_path: string }).source_path !== 'sample.md';
  expect(after.cache.filter(unchanged)).toEqual(before.cache.filter(unchanged));
});

it.each([null, 'detached'])('skips a prepared passive refresh after cleanup of node %s', async (nodeId) => {
  seed(RULE, 'sample.md', nodeId);
  const config = resolveKeepImportRuleConfig(RULE);
  if (!config) throw new Error('Fixture rule unavailable');
  const source = await buildKeepImportSourceDescriptor(config, 'sample.md');
  const pending = refreshKeepImportItemCache(config, source, AT, { force: true, requireTracking: true });
  clearReadwiseTracking({ deletedNodeIds: [], detachedNodeIds: nodeId ? [nodeId] : [] });
  await pending;
  expect(snapshot()).toEqual({ cache: [], tracking: [] });
});
