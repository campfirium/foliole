// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-output-multiline-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-output-multiline-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-output-multiline-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('preserves line breaks inside snowflake notes when extra cloze content spans multiple lines', async () => {
  upsertNodeSnapshot({
    nodeId: 'node-article',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Edited <cloze id="3">guess</cloze id="3"> later.',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-cloze-extra',
    parentNodeId: 'node-article',
    kind: 'item',
    title: 'Edited [...] later.',
    isTitleManual: true,
    content: 'Line one [...]\nLine two',
    reveal: 'real answer',
    anchorLink: { id: '3', kind: 'cloze' },
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  const output = await fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo.md'), 'utf8');

  expect(output).toContain('cloze: Line one [...]\nLine two; answer: real answer');
});

it('does not add a snowflake note when article content starts with a heading matching the title', async () => {
  upsertNodeSnapshot({
    nodeId: 'node-article',
    parentNodeId: null,
    kind: 'topic',
    title: '测试挖空',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '# 测试挖空\n测试<cloze id="1">挖空</cloze id="1">一二三',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-cloze-heading',
    parentNodeId: 'node-article',
    kind: 'item',
    title: '测试挖空',
    isTitleManual: true,
    content: '测试 [...] 一二三',
    reveal: '挖空',
    anchorLink: { id: '1', kind: 'cloze' },
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  const output = await fs.readFile(path.join(tempRoot, 'Library', 'Mirror', '测试挖空.md'), 'utf8');

  expect(output).toContain('测试<u>挖空</u>一二三');
  expect(output).not.toContain('❄');
});

it('does not add a snowflake note for a plain cloze that only differs by spacing around the placeholder', async () => {
  upsertNodeSnapshot({
    nodeId: 'node-article',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '测试<cloze id="1">挖空</cloze id="1">一二三',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-cloze',
    parentNodeId: 'node-article',
    kind: 'item',
    title: '测试挖空',
    isTitleManual: true,
    content: '测试 [...] 一二三',
    reveal: '挖空',
    anchorLink: { id: '1', kind: 'cloze' },
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  const output = await fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo.md'), 'utf8');

  expect(output).toContain('测试<u>挖空</u>一二三');
  expect(output).not.toContain('❄ cloze: 测试 [...] 一二三');
});

it('does not add a snowflake note when the cloze prompt only changes placeholder marker symbols', async () => {
  upsertNodeSnapshot({
    nodeId: 'node-article',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '测试<cloze id="2">挖空</cloze id="2">一二三',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-cloze-marker-only',
    parentNodeId: 'node-article',
    kind: 'item',
    title: '测试挖空',
    isTitleManual: true,
    content: '测试【...】一二三',
    reveal: '挖空',
    anchorLink: { id: '2', kind: 'cloze' },
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  const output = await fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo.md'), 'utf8');

  expect(output).toContain('测试<u>挖空</u>一二三');
  expect(output).not.toContain('❄ cloze: 测试【...】一二三');
});
