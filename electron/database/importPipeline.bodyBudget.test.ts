// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs')
}) }));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';
import { splitTopic } from './splitTopicMutation.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-body-budget-'));
  appData = path.join(root, 'data');
  await initializeDatabase();
  resetSeededWorkspace();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function prepared(content: string, minute = 0) {
  return createPreparedDesktopTextImport({
    content, degradedReason: null, fileName: 'sample.txt', filePath: '/safe-fixture/sample.txt',
    importedAt: `2026-10-08T00:${String(minute).padStart(2, '0')}:00.000Z`, kind: 'text'
  });
}

function storedBody(id: string) {
  const body = loadNodeBodyResolution(openDatabaseConnection().driver, id);
  if (!body) throw new Error('fixture_body_missing');
  return body.content;
}

function requireNodeId(record: ReturnType<typeof runPreparedImport>) {
  if (!record.nodeId) throw new Error('fixture_import_missing');
  return record.nodeId;
}

function assertBoundedBodies() {
  const driver = openDatabaseConnection().driver;
  const ids = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE deleted_at IS NULL');
  for (const { id } of ids) expect(Buffer.byteLength(storedBody(id), 'utf8')).toBeLessThanOrEqual(TEXT_BODY_MAX_BYTES);
}

it('keeps a final body at the exact limit as a single topic', () => {
  const input = prepared('x'.repeat(TEXT_BODY_MAX_BYTES));
  const id = requireNodeId(runPreparedImport(input));
  expect(storedBody(id)).toBe(input.content);
  expect(readBodyPartIds(openDatabaseConnection().driver, id)).toEqual([]);
  assertBoundedBodies();
});

it('accepts the complete oversized decoded body in ordered bounded parts', () => {
  const input = prepared('中文😀'.repeat(160_000));
  const id = requireNodeId(runPreparedImport(input));
  const driver = openDatabaseConnection().driver;
  expect(storedBody(id)).toBe('');
  expect(readBodyPartIds(driver, id).length).toBeGreaterThan(1);
  expect(readPartitionedNodeBody(driver, id)).toBe(input.content);
  assertBoundedBodies();
});

it('reuses the source and part identities on duplicate imports and source updates', () => {
  const input = prepared('x'.repeat(TEXT_BODY_MAX_BYTES + 20));
  const first = runPreparedImport(input);
  const id = requireNodeId(first);
  const driver = openDatabaseConnection().driver;
  const ids = readBodyPartIds(driver, id);
  const duplicate = runPreparedImport(prepared(input.content, 1));
  expect(duplicate.nodeId).toBe(id);
  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(readBodyPartIds(driver, id)).toEqual(ids);
  const next = prepared(input.content + 'tail', 2);
  expect(runPreparedImport(next).nodeId).toBe(id);
  expect(readPartitionedNodeBody(driver, id)).toBe(next.content);
  expect(readBodyPartIds(driver, id)).toEqual(ids);
  assertBoundedBodies();
});

it('rolls back the complete import if a later part cannot be stored', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`CREATE TEMP TRIGGER fail_second_part BEFORE INSERT ON nodes
    WHEN NEW.id GLOB 'node-body-part-*-000000000001'
    BEGIN SELECT RAISE(ABORT, 'fixture_second_part_failure'); END`);
  expect(() => runPreparedImport(prepared('x'.repeat(TEXT_BODY_MAX_BYTES + 1))))
    .toThrow('fixture_second_part_failure');
  expect(connection.driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM import_runs')?.count).toBe(0);
  expect(connection.driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM import_sources')?.count).toBe(0);
  expect(connection.driver.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'node-body-part-%'")?.count).toBe(0);
});

it('keeps a normal highlight whole and attaches it to the containing body part', () => {
  const quote = 'A uniquely identifiable highlighted sentence.';
  const input = prepared('x'.repeat(TEXT_BODY_MAX_BYTES - 10) + quote + '\n\n' + 'y'.repeat(40));
  input.matchedHighlights = [{ content: quote, label: null, locatorText: quote }];
  const id = requireNodeId(runPreparedImport(input));
  const driver = openDatabaseConnection().driver;
  const highlight = driver.queryOne<{ id: string; parent_id: string; anchor_link: string }>(
    'SELECT id, parent_id, anchor_link FROM nodes WHERE anchor_link IS NOT NULL');
  expect(highlight).toBeTruthy();
  if (!highlight) throw new Error('fixture_highlight_missing');
  expect(readBodyPartIds(driver, id)).toContain(highlight.parent_id);
  expect(storedBody(highlight.id)).toBe(quote);
  const anchor = JSON.parse(highlight.anchor_link);
  expect(storedBody(highlight.parent_id).slice(anchor.locator.from, anchor.locator.to)).toBe(quote);
  assertBoundedBodies();
});

it('partitions the complete edited candidate while keeping the source identity and manual children', () => {
  const id = requireNodeId(runPreparedImport(prepared('original')));
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO nodes (id, parent_id, title, content, kind, created_at, updated_at) VALUES ('manual', ?, 'Manual', 'keep', 'topic', ?, ?)",
    [id, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z']);
  const content = 'prefix😀' + '中'.repeat(400_000) + 'original';
  const result = splitTopic({ disposition: 'partition-body', sourceNodeId: id, expectedContent: 'original', content });
  expect(result.activeNodeId).toBe(readBodyPartIds(driver, id)[0]);
  expect(readPartitionedNodeBody(driver, id)).toBe(content);
  expect(driver.queryOne<{ parent_id: string }>("SELECT parent_id FROM nodes WHERE id = 'manual'")?.parent_id).toBe(id);
  expect(storedBody(id)).toBe('');
  assertBoundedBodies();
});

it('refuses a stale candidate without changing the stored body', () => {
  const id = requireNodeId(runPreparedImport(prepared('original')));
  expect(() => splitTopic({ disposition: 'partition-body', sourceNodeId: id, expectedContent: 'stale', content: 'x'.repeat(TEXT_BODY_MAX_BYTES + 1) }))
    .toThrow('body_partition_source_changed');
  expect(storedBody(id)).toBe('original');
  expect(readBodyPartIds(openDatabaseConnection().driver, id)).toEqual([]);
});

it('rolls back an edited candidate if a later part fails', () => {
  const id = requireNodeId(runPreparedImport(prepared('original')));
  openDatabaseConnection().sqlite.exec(`CREATE TEMP TRIGGER fail_edit_part BEFORE INSERT ON nodes
    WHEN NEW.id GLOB 'node-body-part-*-000000000001'
    BEGIN SELECT RAISE(ABORT, 'fixture_edit_part_failure'); END`);
  expect(() => splitTopic({ disposition: 'partition-body', sourceNodeId: id, expectedContent: 'original', content: 'x'.repeat(TEXT_BODY_MAX_BYTES + 1) }))
    .toThrow('fixture_edit_part_failure');
  expect(storedBody(id)).toBe('original');
  expect(readBodyPartIds(openDatabaseConnection().driver, id)).toEqual([]);
});

it('uses the same partition save for an empty body and retains prior parts when the parent is edited', () => {
  const id = requireNodeId(runPreparedImport(prepared('original')));
  const driver = openDatabaseConnection().driver;
  writeNodeBody({ driver, nodeId: id, title: 'Source', content: '', updatedAt: '2026-10-08T00:01:00.000Z' });
  const content = 'x'.repeat(TEXT_BODY_MAX_BYTES + 10);
  splitTopic({ disposition: 'partition-body', sourceNodeId: id, expectedContent: '', content });
  expect(readPartitionedNodeBody(driver, id)).toBe(content);
  const prefix = '中'.repeat(400_000);
  splitTopic({ disposition: 'partition-body', sourceNodeId: id, expectedContent: '', content: prefix });
  expect(readPartitionedNodeBody(driver, id)).toBe(prefix + content);
  assertBoundedBodies();
});
