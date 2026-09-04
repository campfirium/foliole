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
import {
  configureRemoteImageFetchTransportForTests,
  resetRemoteImagePipelineForTests
} from '../attachments/remoteImagePipeline.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { mergeReadwiseTopicHighlightsFromFile } from './readwiseTopicMerge.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-topic-highlight-merge-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  resetRemoteImagePipelineForTests();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  initializeDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
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
  const node = connection.sqlite
    .prepare(
      `SELECT n.content, n.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ?`
    )
    .get(nodeId) as { body_blob_data: string; body_blob_hash: string; content: string } | undefined;
  const children = connection.sqlite
    .prepare('SELECT content, anchor_link, image_regions FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
    .all(nodeId) as Array<{ anchor_link: string | null; content: string; image_regions: string | null }>;
  return { children, node };
}

function parseAnchorLink(value: string | null) {
  return JSON.parse(value ?? '{}') as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

it('merges selected highlight files into an existing topic and appends newly added highlights later', async () => {
  const imported = createImportedTopic();
  const firstHighlightPath = await writeHighlightFile(
    'highlights-1.md',
    ['# Article', '', '## Highlights', '', '- Alpha sentence.', '    - Note: First note'].join('\n')
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
  expect(firstState.children).toHaveLength(1);
  const firstAnchorLink = parseAnchorLink(firstState.children[0]!.anchor_link);
  expect(firstState.node?.content).toBe(['# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'));
  expect(firstState.node?.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(firstState.node?.body_blob_data).toBe(firstState.node?.content);
  expect(firstAnchorLink).toEqual(expect.objectContaining({
    kind: 'highlight',
    locator: expect.objectContaining({ originalText: 'Alpha sentence.' })
  }));
  expect(firstState.children[0]?.content).toBe('Alpha sentence.\n※ First note');

  const secondResult = await mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, secondHighlightPath);
  const secondState = readMergedState(imported.nodeId as string);
  expect(secondResult).toEqual({
    merged_highlight_count: 1,
    node_id: imported.nodeId,
    status: 'merged'
  });
  expect(secondState.children).toHaveLength(2);
  const secondAnchorLink = parseAnchorLink(secondState.children[1]!.anchor_link);
  expect(secondState.node?.content).toBe(['# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'));
  expect(secondAnchorLink).toEqual(expect.objectContaining({
    kind: 'highlight',
    locator: expect.objectContaining({ originalText: 'Beta sentence.' })
  }));
});

it('keeps unmatched manual highlight content as child nodes without changing the source body', async () => {
  const imported = createImportedTopic();
  const highlightPath = await writeHighlightFile('highlights-empty.md', '# Article\n\nNo parsed highlights here.');

  await expect(mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, highlightPath)).resolves.toEqual({
    merged_highlight_count: 2,
    node_id: imported.nodeId,
    status: 'merged'
  });
  const state = readMergedState(imported.nodeId as string);
  expect(state.node?.content).toBe(['# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'));
  expect(state.children.map((child) => ({
    anchorLink: child.anchor_link ? parseAnchorLink(child.anchor_link) : null,
    content: child.content
  }))).toEqual([
    {
      anchorLink: null,
      content: '# Article'
    },
    {
      anchorLink: null,
      content: 'No parsed highlights here.'
    }
  ]);
});

it('merges a long article case with the full set of highlights', async () => {
  const articlePath = path.join(tempRoot, 'GTD 项目管理方法.md');
  const articleContent = [
    '# GTD 项目管理方法',
    '',
    '收集箱：彻底放开，把所有需要关注的事项先放进可信系统。',
    '',
    '购物清单单独作为项目，避免和下一步行动混在一起。',
    '',
    '忽视回顾，系统就不再是系统。'
  ].join('\n');
  const highlightPath = await writeHighlightFile(
    'GTD 项目管理方法-highlight.md',
    [
      '# GTD 项目管理方法',
      '',
      '## Highlights',
      '',
      '- 收集箱：彻底放开，把所有需要关注的事项先放进可信系统。',
      '- 购物清单单独作为项目，避免和下一步行动混在一起。',
      '- 忽视回顾，系统就不再是系统。'
    ].join('\n')
  );
  await fs.writeFile(articlePath, articleContent, 'utf8');

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
  expect(result.merged_highlight_count).toBeGreaterThan(0);
  expect(result.merged_highlight_count).toBe(state.children.length);
});

it('localizes shared remote images before matching manually merged readwise highlights', async () => {
  const largePngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x05, 0x00,
    0x00, 0x00, 0x03, 0xc0
  ]);
  const fetchTransport = vi.fn().mockResolvedValue(new Response(largePngBytes, {
    headers: { 'content-type': 'image/png' },
    status: 200
  }));
  configureRemoteImageFetchTransportForTests(fetchTransport);
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: [
        '# Article',
        '',
        'Lead ![Avatar](https://cdn.example.com/avatar.png)'
      ].join('\n'),
      fileName: 'article.md',
      filePath: '/tmp/article.md',
      importedAt: '2026-04-11T10:00:00.000Z',
      kind: 'markdown'
    })
  );
  const highlightPath = await writeHighlightFile(
    'highlights-image.md',
    [
      '# Article',
      '',
      '## Highlights',
      '',
      '- ![Avatar](https://cdn.example.com/avatar.png) ([View Highlight](https://read.readwise.io/read/01image))'
    ].join('\n')
  );

  await expect(mergeReadwiseTopicHighlightsFromFile(imported.nodeId as string, highlightPath)).resolves.toEqual({
    merged_highlight_count: 1,
    node_id: imported.nodeId,
    status: 'merged'
  });
  const state = readMergedState(imported.nodeId as string);
  const anchorLink = parseAnchorLink(state.children[0]!.anchor_link);
  const locator = anchorLink.locator;
  const attachmentRows = openDatabaseConnection().sqlite
    .prepare('SELECT attachment_id FROM node_attachments WHERE node_id = ?')
    .all(imported.nodeId as string);

  expect(fetchTransport).toHaveBeenCalledTimes(1);
  expect(state.children).toHaveLength(1);
  expect(state.node?.content).toContain('Lead\n\n![Avatar](asset://');
  expect(state.children[0]?.content).toContain('![Avatar](asset://');
  expect(state.children[0]?.content).not.toContain('View Highlight');
  expect(locator?.originalText).toContain('![Avatar](asset://');
  expect(locator ? state.node?.content.slice(locator.from, locator.to) : null).toBe(locator?.originalText);
  expect(state.children[0]?.image_regions).not.toBeNull();
  expect(attachmentRows).toHaveLength(1);
});
