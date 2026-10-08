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
import { insertImportedHighlightNodes } from '../../lib/core/database/importDerivedHighlights.js';
import { persistReadwiseHighlightUpdates } from '../../lib/core/database/importReadwiseHighlightBackfill.js';
import { readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { NODE_TEXT_MAX_BYTES } from '../../lib/core/nodes/nodeTextBudget.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-annotation-budget-'));
  appData = path.join(root, 'data');
  await initializeDatabase();
  resetSeededWorkspace();
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });
const now = '2026-10-09T00:00:00.000Z';
function prepared(content: string, minute = 0) {
  return { ...createPreparedDesktopTextImport({ content, degradedReason: null, fileName: 'source.txt',
    filePath: '/safe-fixture/source.txt', importedAt: `2026-10-09T00:0${minute}:00.000Z`, kind: 'text' }),
  sourceProfile: 'body_with_highlight_sidecar' as const };
}

it('rejects an oversized generated highlight with a persisted reason while importing the complete oversized body and valid highlight', () => {
  const body = '正文😀'.repeat(160_000);
  const record = runPreparedImport({ ...prepared(body), unmatchedHighlights: [
    { content: '中'.repeat(Math.ceil(NODE_TEXT_MAX_BYTES / 3)), label: null, nodeId: 'too-large' },
    { content: 'Valid note', label: null, nodeId: 'valid-note' }
  ] });
  const { driver } = openDatabaseConnection();
  expect(record.resultStatus).toBe('degraded');
  expect(record.degradedReason).toContain('Imported highlight too-large exceeds the 1 MiB text limit (reference text,');
  expect(record.degradedReason).toContain('and was not imported.');
  expect(readPartitionedNodeBody(driver, record.nodeId!)).toBe(body);
  expect(driver.queryOne('SELECT id FROM nodes WHERE id=?', ['too-large'])).toBeUndefined();
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id=?', ['valid-note'])?.content).toBe('Valid note');
  expect(driver.queryOne<{ degraded_reason: string }>('SELECT degraded_reason FROM import_runs WHERE id=?', [record.importId])?.degraded_reason)
    .toBe(record.degradedReason);
});

it('accepts exact-limit generated content and rejects oversized imported labels without truncation', () => {
  const record = runPreparedImport({ ...prepared('Short body'), unmatchedHighlights: [
    { content: 'x'.repeat(NODE_TEXT_MAX_BYTES), label: null, nodeId: 'at-limit' },
    { content: 'Small note', label: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1), nodeId: 'large-title' }
  ] });
  const { driver } = openDatabaseConnection();
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id=?', ['at-limit'])?.content)
    .toHaveLength(NODE_TEXT_MAX_BYTES);
  expect(driver.queryOne('SELECT id FROM nodes WHERE id=?', ['large-title'])).toBeUndefined();
  expect(record.degradedReason).toContain('Imported highlight large-title exceeds the 1 MiB text limit (reference text,');
});

it('preserves an existing highlight when its replacement exceeds the limit and still imports valid replacements and full body', () => {
  const first = runPreparedImport({ ...prepared('Old note\nBody'), matchedHighlights: [
    { content: 'Old note', label: null, nodeId: 'existing-note' }
  ] }, { resetImportedStructure: true });
  const body = 'Old note\nBody\nGood note\n' + 'x'.repeat(NODE_TEXT_MAX_BYTES);
  const record = runPreparedImport({ ...prepared(body, 1), matchedHighlights: [
    { content: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1), label: null, nodeId: 'existing-note' },
    { content: 'Good note', label: null, nodeId: 'good-note' }
  ] }, { resetImportedStructure: true });
  const { driver } = openDatabaseConnection();
  expect(record.nodeId).toBe(first.nodeId);
  expect(readPartitionedNodeBody(driver, record.nodeId!)).toBe(body);
  expect(driver.queryOne<{ content: string; deleted_at: string | null }>(
    'SELECT content,deleted_at FROM nodes WHERE id=?', ['existing-note']))
    .toEqual({ content: 'Old note', deleted_at: null });
  expect(driver.queryOne('SELECT id FROM nodes WHERE id=?', ['good-note'])).toBeDefined();
  expect(record.resultStatus).toBe('degraded');
});

it('retains existing highlights when a rejected replacement has no stable ID while accepting a valid new item', () => {
  const first = runPreparedImport({ ...prepared('Old note\nBody'), matchedHighlights: [
    { content: 'Old note', label: null, nodeId: 'existing-note' }
  ] }, { resetImportedStructure: true });
  const body = 'Old note\nBody\nGood note';
  const record = runPreparedImport({ ...prepared(body, 1), unmatchedHighlights: [
    { content: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1), label: null }
  ], matchedHighlights: [{ content: 'Good note', label: null, nodeId: 'good-note' }] },
  { resetImportedStructure: true });
  const { driver } = openDatabaseConnection();
  expect(record.nodeId).toBe(first.nodeId);
  expect(record.resultStatus).toBe('degraded');
  expect(driver.queryOne<{ content: string; deleted_at: string | null }>(
    'SELECT content,deleted_at FROM nodes WHERE id=?', ['existing-note']))
    .toEqual({ content: 'Old note', deleted_at: null });
  expect(driver.queryOne('SELECT id FROM nodes WHERE id=?', ['good-note'])).toBeDefined();
});

it('rejects a generated cloze whose actual prompt exceeds the limit before creating any child fields', () => {
  const source = runPreparedImport(prepared('Source body'));
  const failures: string[] = [];
  const { driver } = openDatabaseConnection();
  const count = driver.transaction(tx => insertImportedHighlightNodes({ driver: tx, parentNodeId: source.nodeId!,
    importedAt: now, parentContent: 'A' + 'x'.repeat(NODE_TEXT_MAX_BYTES), budgetFailures: failures,
    highlights: [{ nodeId: 'cloze-too-large', anchorId: 'cloze-anchor', kind: 'cloze', label: null,
      content: 'A', from: 0, to: 1 }] }));
  expect(count).toBe(0);
  expect(driver.queryOne('SELECT id FROM nodes WHERE id=?', ['cloze-too-large'])).toBeUndefined();
  expect(failures.join(';')).toContain('Imported cloze cloze-too-large exceeds the 1 MiB text limit (prompt,');
});

it('saves the first 100 Unicode title characters with a report and preserves complete body and fingerprints', () => {
  const body = 'Complete body\n' + '中'.repeat(NODE_TEXT_MAX_BYTES);
  const input = { ...prepared(body), nodeTitle: '😀'.repeat(110) };
  const record = runPreparedImport(input);
  const { driver } = openDatabaseConnection();
  expect(driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id=?', [record.nodeId])?.title).toBe('😀'.repeat(100));
  expect(readPartitionedNodeBody(driver, record.nodeId!)).toBe(body);
  expect(record.contentFingerprint).toBe(input.contentFingerprint);
  expect(record.sourceFingerprint).toBe(input.sourceFingerprint);
  expect(record.resultStatus).toBe('degraded');
  expect(record.degradedReason).toContain('title was shortened to 100 characters.');
});

it('rejects oversized locator text before repairing an existing unanchored imported child', () => {
  const source = runPreparedImport({ ...prepared('Small note'), unmatchedHighlights: [
    { content: 'Small note', label: null, nodeId: 'unanchored-note' }
  ] });
  const { driver } = openDatabaseConnection();
  const before = driver.queryOne('SELECT content,anchor_link,updated_at FROM nodes WHERE id=?', ['unanchored-note']);
  const failures: string[] = [];
  const count = driver.transaction(tx => persistReadwiseHighlightUpdates({ driver: tx,
    parentNodeId: source.nodeId!, parentContent: 'Small note', importedAt: now, budgetFailures: failures,
    highlights: [{ content: 'Small note', label: null, anchorId: 'incoming-anchor', kind: 'highlight',
      from: 0, to: 10, locatorText: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1) }] }));
  expect(count).toBe(0);
  expect(driver.queryOne('SELECT content,anchor_link,updated_at FROM nodes WHERE id=?', ['unanchored-note'])).toEqual(before);
  expect(failures.join(';')).toContain('Imported highlight 1 exceeds the 1 MiB text limit (reference text,');
});

it('keeps collision suffixes within the actual 100-character stored title', () => {
  const title = '😀'.repeat(100);
  const first = runPreparedImport({ ...prepared('First body'), nodeTitle: title });
  const second = runPreparedImport({ ...prepared('Second body', 1), sourceLocator: '/safe-fixture/second.txt',
    sourceFingerprint: 'second-source', nodeTitle: title });
  const { driver } = openDatabaseConnection();
  expect(driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id=?', [first.nodeId])?.title).toBe(title);
  expect(driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id=?', [second.nodeId])?.title)
    .toBe('😀'.repeat(98) + ' 2');
  expect(second.degradedReason).toContain('title was shortened to 100 characters.');
});

it('normalizes a changed imported title and generated image title while preserving original content', () => {
  const first = runPreparedImport(prepared('Original body'), { resetImportedStructure: true });
  const image = `![${'😀'.repeat(110)}](asset://fixture-image)`;
  const input = { ...prepared(`Updated body\n${image}`, 1), nodeTitle: '新'.repeat(110),
    matchedHighlights: [{ content: image, label: null, nodeId: 'image-title' }] };
  const record = runPreparedImport(input, { resetImportedStructure: true });
  const { driver } = openDatabaseConnection();
  expect(record.nodeId).toBe(first.nodeId);
  expect(driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id=?', [record.nodeId])?.title).toBe('新'.repeat(100));
  expect(driver.queryOne<{ title: string; content: string }>('SELECT title,content FROM nodes WHERE id=?', ['image-title']))
    .toEqual({ title: '😀'.repeat(100), content: image });
  expect(record.degradedReason).toContain('Imported highlight image-title title was shortened');
});

it('retains an unchanged historical imported title when updating the source body', () => {
  const first = runPreparedImport(prepared('Original body'), { resetImportedStructure: true });
  const { driver } = openDatabaseConnection();
  const historical = 'Legacy title '.repeat(20);
  driver.execute('UPDATE nodes SET title=? WHERE id=?', [historical, first.nodeId]);
  const record = runPreparedImport({ ...prepared('Changed source body', 1), nodeTitle: historical },
    { resetImportedStructure: true });
  expect(driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id=?', [record.nodeId])?.title).toBe(historical);
  expect(readPartitionedNodeBody(driver, record.nodeId!)).toBe('Changed source body');
});
