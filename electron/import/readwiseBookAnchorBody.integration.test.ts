// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
  app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
}) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { placeReadwiseBookHighlights } from './readwiseBookHighlightPlacement.js';
import { captureReadwiseBookRootTexts, relocateReadwiseBookLocalAnchors } from './readwiseBookLocalAnchors.js';
import { captureReadwiseSourceLocalAnchors, relocateReadwiseSourceLocalAnchors } from './readwiseSourceResyncLocalAnchors.js';

const importedAt = '2026-10-08T00:00:00.000Z';
let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-anchor-body-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('captures local excerpts and relocates only unique matches', async () => {
  seedNode('book', null, 'Root');
  seedNode('one', 'book', 'Before Exact excerpt After');
  seedNode('two', 'book', 'Repeated excerpt');
  seedNode('three', 'book', 'Repeated excerpt');
  seedNode('local', 'book', 'Note 中文 😀\u0000', 'Exact excerpt');
  seedNode('ambiguous', 'book', 'Repeated excerpt', 'Repeated excerpt');
  openDatabaseConnection().sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const { driver } = openDatabaseConnection();
  const captured = captureReadwiseBookRootTexts('book');
  expect(captured).toEqual(new Map([['local', 'Exact excerpt'], ['ambiguous', 'Repeated excerpt']]));
  expect(relocateReadwiseBookLocalAnchors({ annotationStates: [],
    bodies: [{ id: 'one', content: 'Before Exact excerpt After' }, { id: 'two', content: 'Repeated excerpt' },
      { id: 'three', content: 'Repeated excerpt' }], connectionRef: 'connection', documentId: 'document',
    importedAt, preservedRootTexts: captured, rootNodeId: 'book' })).toBe(2);
  expect(driver.queryOne<{ parent_id: string; anchor_link: string }>('SELECT parent_id, anchor_link FROM nodes WHERE id = ?', ['local']))
    .toMatchObject({ parent_id: 'one', anchor_link: expect.stringContaining('Exact excerpt') });
  const ambiguous = driver.queryOne<{ parent_id: string; anchor_link: string }>('SELECT parent_id, anchor_link FROM nodes WHERE id = ?', ['ambiguous'])!;
  expect(JSON.parse(ambiguous.anchor_link)).not.toHaveProperty('locator');
  expect(loadNodeBodyResolution(driver, ambiguous.parent_id)).toMatchObject({ content: '# ※' });
  expect(loadNodeBodyResolution(driver, 'local')).toMatchObject({ content: 'Note 中文 😀\u0000' });
});

it('remaps source-local anchors using the complete root body', async () => {
  const content = '😀 Before Exact excerpt After';
  seedNode('book', null, content);
  seedNode('local', 'book', 'Note', 'Exact excerpt');
  openDatabaseConnection().sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const { driver } = openDatabaseConnection();
  const localAnchors = captureReadwiseSourceLocalAnchors('book', new Set());
  relocateReadwiseSourceLocalAnchors({ importedAt, localAnchors, rootNodeId: 'book' });
  const readAnchor = () => driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id = ?', ['local'])!.anchor_link;
  expect(JSON.parse(readAnchor())).toMatchObject({ locator: {
    from: content.indexOf('Exact excerpt'), originalText: 'Exact excerpt', to: content.indexOf('Exact excerpt') + 'Exact excerpt'.length
  } });

});

it('places file sidecar highlights using complete owned chapter bodies', async () => {
  seedNode('book', null, 'Root');
  seedNode('one', 'book', 'First chapter keeps the early remembered quote in place.');
  seedNode('two', 'book', 'Second chapter saves the later insight for a different section.');
  openDatabaseConnection().sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const highlightMarkdownPath = path.join(root, 'highlights.md');
  await fs.writeFile(highlightMarkdownPath, '# Book\n\n## Highlights\nearly remembered quote [...] (https://example.com/1)\n\nlater insight [...] (https://example.com/2)');
  const input = { highlightMarkdownPath, importedAt, readwiseConfig: createDefaultReadwiseReaderConfig(), rootNodeId: 'book' };
  await expect(placeReadwiseBookHighlights(input)).resolves.toEqual({ matchedCount: 2, unmatchedCount: 0 });
  const { driver, sqlite } = openDatabaseConnection();
  const readHighlights = () => driver.queryAll<{ id: string; parent_id: string; anchor_link: string }>(
    'SELECT id, parent_id, anchor_link FROM nodes WHERE anchor_link IS NOT NULL ORDER BY parent_id'
  );
  const before = readHighlights();
  expect(before.map((row) => loadNodeBodyResolution(driver, row.id)))
    .toEqual([expect.objectContaining({ content: 'early remembered quote' }), expect.objectContaining({ content: 'later insight' })]);
  expect(before.map((row) => JSON.parse(row.anchor_link).locator.originalText)).toEqual(['early remembered quote', 'later insight']);

  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

function seedNode(id: string, parentId: string | null, content: string, originalText?: string) {
  const driver = openDatabaseConnection().driver;
  const anchor = originalText ? JSON.stringify({ id: `anchor-${id}`, kind: 'highlight', locator: { from: 0, to: originalText.length, originalText } }) : null;
  driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, is_title_manual, content, anchor_link, created_at, updated_at)
    VALUES (?, ?, 'topic', ?, 1, '', ?, ?, ?)`, [id, parentId, id, anchor, importedAt, importedAt]);
  writeNodeBody({ driver, nodeId: id, title: id, content, updatedAt: importedAt });
}
