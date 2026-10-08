// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { runSingleKeepImportSource } from '../import/keepImportRunSource.js';
import { runKeepImportRule } from '../import/keepImportService.js';

let root = '';
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { recordPreparedImportFailure, runPreparedImport } from './importPipeline.js';
import { readKeepImportNodeContent } from './keepImportItems.js';
import { initializeDatabase } from './migrate.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

const time = '2026-10-08T00:00:00.000Z';
const body = 'Prefix Target sentence.\n' + '\ufeff中😀\0'.repeat(80_000);
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-owned-body-'));
  await initializeDatabase(undefined, { recovery: 'fail' });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function prepared(sourceProfile: 'default' | 'body_with_highlight_sidecar'): PreparedImportRecord {
  return { provider: 'desktop_text_file', sourceName: 'article.md', sourceLocator: '/isolated/article.md',
    sourceKind: 'markdown', sourceFingerprint: 'source', contentFingerprint: 'first',
    nodeTitle: 'Article', hideTitleHeading: false, content: body, degradedReason: null,
    importedAt: time, sourceProfile, matchedHighlights: [{ content: 'Target sentence.', label: null }] };
}

function assertOwnedBody(nodeId: string, content: string) {
  const { driver } = openDatabaseConnection();
  expect(loadNodeBodyResolution(driver, nodeId)).toMatchObject({ content, source: 'node' });
  const version = flushNodeSyncVersion(nodeId, time);
  expect(driver.queryOne('SELECT body_text = ? AS exact FROM node_sync_versions WHERE version_id = ?', [content, version]))
    .toEqual({ exact: 1 });
  expect(driver.queryOne('SELECT count(*) AS count FROM content_blob_data')).toEqual({ count: 0 });
  expect(driver.queryAll('PRAGMA foreign_key_check')).toEqual([]);
}

it.each(['default', 'body_with_highlight_sidecar'] as const)('preserves new, duplicate and updated %s imports with full node-owned text', (profile) => {
  const input = prepared(profile);
  const first = runPreparedImport(input);
  if (!first.nodeId) throw new Error('import_node_missing');
  expect(first).toMatchObject({ duplicateSemantic: 'new', resultStatus: 'imported' });
  assertOwnedBody(first.nodeId, body);
  expect(runPreparedImport(input)).toMatchObject({ nodeId: first.nodeId, duplicateSemantic: 'duplicate' });
  const next = { ...input, content: 'Longer ' + body, contentFingerprint: 'second',
    matchedHighlights: [{ content: 'Prefix', label: null }] };
  expect(runPreparedImport(next, { resetImportedStructure: true }))
    .toMatchObject({ nodeId: first.nodeId, duplicateSemantic: 'updated' });
  assertOwnedBody(first.nodeId, next.content);
  const { driver } = openDatabaseConnection();
  const children = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ?', [first.nodeId]);
  expect(children).toHaveLength(1);
  const child = children[0];
  if (!child) throw new Error('import_child_missing');
  expect(loadNodeBodyResolution(driver, child.id)).toMatchObject({ content: 'Prefix' });
  expect(recordPreparedImportFailure(next, 'source_read_failed'))
    .toMatchObject({ nodeId: first.nodeId, resultStatus: 'failed', duplicateSemantic: 'duplicate' });
}, 20_000);

it('imports a local Markdown image and publishes the rewritten complete body', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=', 'base64');
  await fs.writeFile(path.join(root, 'picture.png'), bytes);
  const imported = runPreparedImport({ ...prepared('default'), content: '![Picture](picture.png)',
    sourceLocator: path.join(root, 'article.md'), matchedHighlights: [] });
  if (!imported.nodeId) throw new Error('import_node_missing');
  expect(imported.resultStatus).toBe('imported');
  assertOwnedBody(imported.nodeId, `![Picture](asset://${createHash('sha256').update(bytes).digest('hex')}.png)`);
});

it('runs watched imports, repeat scans and forced updates through the full-body production pipeline', async () => {
  const directoryPath = path.join(root, 'sources');
  const filePath = path.join(directoryPath, 'article.md');
  await fs.mkdir(directoryPath);
  await fs.writeFile(filePath, 'First 中😀 body');
  const config = { directoryPath, highlightPolicy: 'reference_only' as const, ruleId: 'watched' };
  expect(await runKeepImportRule(config)).toEqual([expect.objectContaining({ importStatus: 'imported' })]);
  const driver = openDatabaseConnection().driver;
  const item = driver.queryOne<{ last_node_id: string }>('SELECT last_node_id FROM keep_import_items WHERE rule_id = ?', [config.ruleId]);
  if (!item) throw new Error('import_item_missing');
  expect(readKeepImportNodeContent(item.last_node_id)).toBe('First 中😀 body');
  const runs = driver.queryAll('SELECT * FROM import_runs');
  expect(await runKeepImportRule(config)).toEqual([expect.objectContaining({ action: 'skipped' })]);
  expect(driver.queryAll('SELECT * FROM import_runs')).toEqual(runs);
  await fs.writeFile(filePath, 'Updated longer 中😀 body');
  const stats = await fs.stat(filePath);
  expect(await runSingleKeepImportSource(config, { adapterId: 'markdown_directory', filePath, kind: 'markdown',
    mtimeMs: stats.mtimeMs, sizeBytes: stats.size, sourceName: 'article.md' }, { forceTopicImport: true }))
    .toMatchObject({ importStatus: 'imported' });
  expect(readKeepImportNodeContent(item.last_node_id)).toBe('Updated longer 中😀 body');
  expect(driver.queryAll('PRAGMA foreign_key_check')).toEqual([]);
});
