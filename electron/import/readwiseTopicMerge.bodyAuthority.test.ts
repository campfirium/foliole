// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-topic-merge-body-authority-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { mergeReadwiseTopicHighlightsFromFile } from './readwiseTopicMerge.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-topic-merge-body-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createTopic() {
  return runPreparedImport(createPreparedDesktopTextImport({
    content: '# Article\n\nAlpha sentence.\n\nBeta sentence.',
    fileName: 'article.md',
    filePath: '/tmp/article.md',
    importedAt: '2026-09-04T04:00:00.000Z',
    kind: 'markdown'
  })).nodeId as string;
}

async function writeHighlightFile() {
  const highlightPath = path.join(tempRoot, 'highlights.md');
  await fs.writeFile(highlightPath, '# Article\n\n## Highlights\n\n- Beta sentence.', 'utf8');
  return highlightPath;
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
    )
  };
}

it('merges highlights against the resolved Blob body and preserves local edits', async () => {
  const nodeId = createTopic();
  const driver = openDatabaseConnection().driver;
  const localBody = '# Article\n\nAlpha sentence.\n\nBeta sentence.\n\nLocal appendix.';
  writeNodeBody({ content: localBody, driver, nodeId, title: 'Article', updatedAt: '2026-09-04T04:01:00.000Z' });
  driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', nodeId]);

  await expect(mergeReadwiseTopicHighlightsFromFile(nodeId, await writeHighlightFile())).resolves.toMatchObject({
    merged_highlight_count: 1,
    status: 'merged'
  });
  const state = readState(nodeId);
  const locator = JSON.parse(state.children[0]!.anchor_link ?? '{}').locator as { from: number; to: number };

  expect(state.body?.status === 'resolved' ? state.body.content : '').toBe(localBody);
  expect(state.children).toHaveLength(1);
  expect(localBody.slice(locator.from, locator.to)).toBe('Beta sentence.');
});

it('leaves an unavailable topic unchanged when a manual merge is requested', async () => {
  const nodeId = createTopic();
  const before = readState(nodeId);
  openDatabaseConnection().driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [before.node!.body_blob_hash]);

  await expect(mergeReadwiseTopicHighlightsFromFile(nodeId, await writeHighlightFile())).resolves.toEqual({
    merged_highlight_count: 0,
    node_id: nodeId,
    status: 'error'
  });
  const after = readState(nodeId);
  expect(after.node).toEqual(before.node);
  expect(after.children).toEqual(before.children);
  expect(after.body).toMatchObject({ bodyBlobHash: before.node!.body_blob_hash, status: 'unavailable' });
});
