import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_NAME = 'T175 Article.md';
const LOCAL_APPENDIX = 'Local appendix survives the Readwise refresh.';

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 5000');
  return database;
}

function writeBlobOnlyLocalEdit(database: DatabaseSync, nodeId: string, content: string) {
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  const now = new Date().toISOString();
  const size = Buffer.byteLength(content, 'utf8');
  database.prepare(
    `INSERT INTO content_blobs (
       hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)`
  ).run(hash, `text/${hash}`, size, size, hash, hash, now, now, now);
  database.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(hash, Buffer.from(content));
  database.prepare("UPDATE nodes SET content = '', body_blob_hash = ?, updated_at = ? WHERE id = ?")
    .run(hash, now, nodeId);
}

async function writeReadwiseFixture(readwiseRoot: string, includeSecondHighlight: boolean) {
  const articleDirectory = path.join(readwiseRoot, 'Articles');
  const fullDocumentDirectory = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  await mkdir(articleDirectory, { recursive: true });
  await mkdir(fullDocumentDirectory, { recursive: true });
  await writeFile(
    path.join(fullDocumentDirectory, SOURCE_NAME),
    [
      '## Metadata',
      `- Author: ${includeSecondHighlight ? 'Updated' : 'Initial'}`,
      '',
      '## Full Document',
      'Alpha sentence.',
      '',
      'Beta sentence.'
    ].join('\n'),
    'utf8'
  );
  await writeFile(
    path.join(articleDirectory, SOURCE_NAME),
    [
      '# T175 Article',
      '',
      '## Highlights',
      'Alpha sentence.',
      ...(includeSecondHighlight ? ['', 'Beta sentence.'] : [])
    ].join('\n'),
    'utf8'
  );
}

test('Readwise re-import preserves a Blob-only local body and appends highlights across reload', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const readwiseRoot = testInfo.outputPath('readwise-root');
  await writeReadwiseFixture(readwiseRoot, false);
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = readwiseRoot;
  settings.readwiseReaderConfig = {
    ...settings.readwiseReaderConfig,
    enabled: true,
    importScope: 'all',
    validatedAt: new Date().toISOString()
  };
  settings.readwiseSources = applyReadwiseRootPath(settings.readwiseSources, readwiseRoot)
    .map((source) => ({ ...source, keepState: 'enabled' as const }));

  await desktopWindow.evaluate(async (nextSettings) => {
    await window.electronAPI.invoke('save_import_manager_settings', { settings: nextSettings });
    return window.electronAPI.invoke('run_readwise_reader_import', { settings: nextSettings });
  }, settings);
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
  const database = openDatabase(databasePath);
  const imported = database.prepare(
    'SELECT latest_node_id FROM import_sources WHERE source_name = ?'
  ).get(SOURCE_NAME) as { latest_node_id: string };
  const firstBody = database.prepare(
    `SELECT CAST(cbd.data AS TEXT) AS body
     FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`
  ).get(imported.latest_node_id) as { body: string };
  writeBlobOnlyLocalEdit(database, imported.latest_node_id, `${firstBody.body}\n\n${LOCAL_APPENDIX}`);
  database.close();

  await writeReadwiseFixture(readwiseRoot, true);
  const refreshed = await desktopWindow.evaluate((nextSettings) => (
    window.electronAPI.invoke('run_readwise_reader_import', { settings: nextSettings })
  ), settings);
  expect(refreshed).toMatchObject({ status: 'completed' });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const document = await desktopWindow.evaluate((nodeId) => (
    window.electronAPI.invoke('load_node_document', { nodeId })
  ), imported.latest_node_id);
  expect(document.content).toContain('author: Updated');
  expect(document.content).toContain(LOCAL_APPENDIX);

  const verified = openDatabase(databasePath);
  const children = verified.prepare(
    'SELECT content, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(imported.latest_node_id) as Array<{ anchor_link: string; content: string }>;
  verified.close();
  expect(children.map((child) => child.content)).toEqual(['Alpha sentence.', 'Beta sentence.']);
  children.forEach((child) => {
    const locator = JSON.parse(child.anchor_link).locator as { from: number; originalText: string; to: number };
    expect(document.content.slice(locator.from, locator.to)).toBe(locator.originalText);
  });
});
