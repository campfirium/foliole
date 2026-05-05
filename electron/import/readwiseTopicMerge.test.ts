// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-topic-highlight-merge-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { mergeReadwiseTopicHighlightsFromFile } from './readwiseTopicMerge.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-topic-highlight-merge-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createImportedTopic() {
  return runPreparedImport(
    createPreparedDesktopTextImport({
      content: ['# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'),
      fileName: 'article.md',
      filePath: '/tmp/article.md',
      importedAt: '2026-04-11T10:00:00.000Z',
      kind: 'markdown'
    })
  );
}

async function writeHighlightFile(fileName: string, content: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

function readMergedState(nodeId: string) {
  const connection = openDatabaseConnection();
  const node = connection.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get(nodeId) as { content: string } | undefined;
  const children = connection.sqlite
    .prepare('SELECT content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
    .all(nodeId) as Array<{ anchor_link: string | null; content: string }>;
  return { children, node };
}

it('merges selected highlight files into an existing topic and appends newly added highlights later', async () => {
  const imported = createImportedTopic();
  const firstHighlightPath = await writeHighlightFile(
    'highlights-1.md',
    ['# Article', '', '## Highlights', '', '- Alpha sentence.'].join('\n')
  );
  const secondHighlightPath = await writeHighlightFile(
    'highlights-2.md',
    ['# Article', '', '## Highlights', '', '- Beta sentence.'].join('\n')
  );

  const firstResult = await mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, firstHighlightPath);
  const firstState = readMergedState(imported.nodeId as string);
  expect(firstResult).toEqual({
    merged_highlight_count: 1,
    node_id: imported.nodeId,
    status: 'merged'
  });
  expect(firstState.node?.content).toContain('<highlight id="1">Alpha sentence.</highlight id="1">');
  expect(firstState.children).toHaveLength(1);

  const secondResult = await mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, secondHighlightPath);
  const secondState = readMergedState(imported.nodeId as string);
  expect(secondResult).toEqual({
    merged_highlight_count: 1,
    node_id: imported.nodeId,
    status: 'merged'
  });
  expect(secondState.node?.content).toContain('<highlight id="2">Beta sentence.</highlight id="2">');
  expect(secondState.children).toHaveLength(2);
});

it('treats a plain highlight file as a single manual highlight block', async () => {
  const imported = createImportedTopic();
  const highlightPath = await writeHighlightFile('highlights-empty.md', '# Article\n\nNo parsed highlights here.');

  await expect(mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, highlightPath)).resolves.toEqual({
    merged_highlight_count: 1,
    node_id: imported.nodeId,
    status: 'merged'
  });
});

it('merges the GTD article case with the full set of highlights', async () => {
  const articlePath = '/mnt/d/X/Dropbox/obs/clip/Full Document Contents/Articles/GTD 项目管理方法.md';
  const highlightPath = '/mnt/d/X/Dropbox/obs/clip/Articles/GTD 项目管理方法.md';
  const articleContent = await fs.readFile(articlePath, 'utf8');

  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: articleContent,
      fileName: 'GTD 项目管理方法.md',
      filePath: articlePath,
      importedAt: '2026-04-11T10:00:00.000Z',
      kind: 'markdown'
    })
  );

  const result = await mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, highlightPath);
  const state = readMergedState(imported.nodeId as string);

  expect(result.status).toBe('merged');
  expect(result.merged_highlight_count).toBe(34);
  expect(state.children.filter((child) => child.anchor_link !== null)).toHaveLength(34);
});
