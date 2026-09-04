// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-body-authority-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { NodeBodyUnavailableError, loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-readwise-body-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createReadwiseImport(content: string, highlights: string[], importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    fileName: 'article.md',
    filePath: '/tmp/article.md',
    highlightSidecar: highlights.map((text) => ({ text })),
    importedAt,
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
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
    runCount: driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM import_runs')?.count ?? 0
  };
}

it('keeps Blob-only Readwise bodies and local edits across update and duplicate imports', () => {
  const first = runPreparedImport(createReadwiseImport(
    ['---', 'author: One', '---', '# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'),
    ['Alpha sentence.'],
    '2026-09-04T01:00:00.000Z'
  ));
  const nodeId = first.nodeId as string;
  const localBody = ['---', 'author: One', '---', '# Article', '', 'Alpha sentence.', '', 'Beta sentence.', '', 'Local appendix.'].join('\n');
  writeNodeBody({
    content: localBody,
    driver: openDatabaseConnection().driver,
    nodeId,
    title: 'Article',
    updatedAt: '2026-09-04T01:01:00.000Z'
  });
  openDatabaseConnection().driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', nodeId]);

  const prepared = createReadwiseImport(
    ['---', 'author: Two', '---', '# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'),
    ['Alpha sentence.', 'Beta sentence.'],
    '2026-09-04T01:02:00.000Z'
  );
  const updated = runPreparedImport(prepared);
  const afterUpdate = readState(nodeId);
  const duplicate = runPreparedImport({ ...prepared, importedAt: '2026-09-04T01:03:00.000Z' });
  const afterDuplicate = readState(nodeId);

  expect(updated.duplicateSemantic).toBe('updated');
  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(afterUpdate.body).toMatchObject({ source: 'blob', status: 'resolved' });
  expect(afterUpdate.body?.status === 'resolved' ? afterUpdate.body.content : '').toContain('author: Two');
  expect(afterUpdate.body?.status === 'resolved' ? afterUpdate.body.content : '').toContain('Local appendix.');
  expect(afterUpdate.node?.content).toBe(afterUpdate.body?.status === 'resolved' ? afterUpdate.body.content : null);
  expect(afterUpdate.children).toHaveLength(2);
  expect(afterDuplicate.body).toEqual(afterUpdate.body);
  expect(afterDuplicate.children).toEqual(afterUpdate.children);
});

it('rolls back Readwise updates when the authoritative body Blob is unavailable', () => {
  const first = runPreparedImport(createReadwiseImport('# Article\n\nAlpha sentence.', ['Alpha sentence.'], '2026-09-04T02:00:00.000Z'));
  const nodeId = first.nodeId as string;
  const before = readState(nodeId);
  openDatabaseConnection().driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [before.node!.body_blob_hash]);
  const unavailable = readState(nodeId);

  expect(() => runPreparedImport(createReadwiseImport(
    '# Article\n\nAlpha sentence.\n\nBeta sentence.',
    ['Alpha sentence.', 'Beta sentence.'],
    '2026-09-04T02:01:00.000Z'
  ))).toThrow(NodeBodyUnavailableError);

  const after = readState(nodeId);
  expect(after.body).toEqual(unavailable.body);
  expect(after.node).toEqual(unavailable.node);
  expect(after.children).toEqual(unavailable.children);
  expect(after.runCount).toBe(unavailable.runCount);
});
