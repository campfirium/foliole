// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-readwise-body-authority-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveReadwiseKeepImportSettings, seedReadwiseArticleFixture } from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';
import { loadNodeSourceUpdatePreview } from './nodeSourceUpdatePreview.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-readwise-body-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function config(fullDocumentDir: string) {
  return {
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  } as const;
}

function readState(nodeId: string) {
  const driver = openDatabaseConnection().driver;
  return {
    body: loadNodeBodyResolution(driver, nodeId),
    children: driver.queryAll<{ anchor_link: string | null; content: string }>(
      'SELECT content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC',
      [nodeId]
    ),
    node: driver.queryOne<{ body_blob_hash: string; content: string }>(
      'SELECT content, body_blob_hash FROM nodes WHERE id = ?',
      [nodeId]
    ),
    runs: driver.queryAll('SELECT id, result_status FROM import_runs ORDER BY imported_at ASC')
  };
}

async function writeHighlights(highlightDir: string, extra: string) {
  await fs.writeFile(
    path.join(highlightDir, 'Sample Article.md'),
    [
      '# Sample Article',
      '',
      '## Highlights',
      'This is the highlighted sentence.',
      '',
      'Another matching excerpt.',
      '',
      extra
    ].join('\n'),
    'utf8'
  );
}

it('uses the resolved Blob body for keep-import highlights and source preview', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runKeepImportRule(config(fixture.fullDocumentDir));
  const driver = openDatabaseConnection().driver;
  const nodeId = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE source_name = 'Sample Article.md'"
  )!.latest_node_id;
  const initial = loadNodeBodyResolution(driver, nodeId);
  const localBody = `${initial?.status === 'resolved' ? initial.content : ''}\n\nLocal appendix.`;
  writeNodeBody({ content: localBody, driver, nodeId, title: 'Sample Article', updatedAt: '2026-09-04T03:00:00.000Z' });
  driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', nodeId]);

  await writeHighlights(fixture.highlightDir, 'After the quote.');
  await runKeepImportRule(config(fixture.fullDocumentDir));
  const updated = readState(nodeId);
  expect(updated.body?.status === 'resolved' ? updated.body.content : '').toContain('Local appendix.');
  expect(updated.children.some((row) => row.content === 'After the quote.')).toBe(true);

  await fs.writeFile(
    path.join(fixture.fullDocumentDir, 'Sample Article.md'),
    '## Metadata\n- Author: Updated\n\n## Full Document\nUpstream replacement.',
    'utf8'
  );
  await runKeepImportRule(config(fixture.fullDocumentDir));
  await expect(loadNodeSourceUpdatePreview(nodeId)).resolves.toMatchObject({
    current_content: expect.stringContaining('Local appendix.'),
    updated_content: expect.stringContaining('Upstream replacement.')
  });
});

it('reports unavailable bodies without mutating import runs, children, or hashes', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runKeepImportRule(config(fixture.fullDocumentDir));
  const driver = openDatabaseConnection().driver;
  const nodeId = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE source_name = 'Sample Article.md'"
  )!.latest_node_id;
  const before = readState(nodeId);
  driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [before.node!.body_blob_hash]);
  await writeHighlights(fixture.highlightDir, 'Unavailable addition.');
  await fs.writeFile(
    path.join(fixture.fullDocumentDir, 'Sample Article.md'),
    '## Metadata\n- Author: Updated\n\n## Full Document\nUnavailable replacement.',
    'utf8'
  );

  const result = await runKeepImportRule(config(fixture.fullDocumentDir));
  const after = readState(nodeId);

  expect(result).toContainEqual(expect.objectContaining({
    action: 'skipped',
    failureReason: `node_body_unavailable:${nodeId}`
  }));
  expect(after.node).toEqual(before.node);
  expect(after.children).toEqual(before.children);
  expect(after.runs).toEqual(before.runs);
  expect(after.body).toMatchObject({ bodyBlobHash: before.node!.body_blob_hash, status: 'unavailable' });
  await expect(loadNodeSourceUpdatePreview(nodeId)).rejects.toThrow(`node_body_unavailable:${nodeId}`);
});
