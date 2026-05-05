// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-output-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-output-documents';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-output-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedMirrorArticleFixture(articleContent: string) {
  upsertNodeSnapshot({
    nodeId: 'node-article',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: articleContent,
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-highlight',
    parentNodeId: 'node-article',
    kind: 'topic',
    title: 'bright text',
    isTitleManual: true,
    content: 'bright text',
    reveal: null,
    anchorLink: { id: '1', kind: 'highlight' },
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-cloze-plain',
    parentNodeId: 'node-article',
    kind: 'item',
    title: 'Study [...] today.',
    isTitleManual: true,
    content: '# Mirror Demo\n\nKeep bright text here.\n\nStudy [...] today.\n\nEdited guess later.',
    reveal: 'answer',
    anchorLink: { id: '2', kind: 'cloze' },
    position: 2,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-cloze-extra',
    parentNodeId: 'node-article',
    kind: 'item',
    title: 'Edited [...] later.',
    isTitleManual: true,
    content: 'Custom prompt [...] only',
    reveal: 'real answer',
    anchorLink: { id: '3', kind: 'cloze' },
    position: 3,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
}

it('writes one readable article .md with inline highlights, inline clozes, and snowflake notes only for extra changes', async () => {
  const articleContent = [
    'Keep <highlight id="1">bright text</highlight id="1"> here.',
    'Study <cloze id="2">answer</cloze id="2"> today.',
    'Edited <cloze id="3">guess</cloze id="3"> later.'
  ].join('\n\n');

  seedMirrorArticleFixture(articleContent);

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  const outputPath = path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo.md');
  const output = await fs.readFile(outputPath, 'utf8');

  expect(output).toContain('# Mirror Demo');
  expect(output).toContain('Keep ==bright text== here.');
  expect(output).toContain('Study <u>answer</u> today.');
  expect(output).toContain('Edited <u>guess</u> (❄ cloze: Custom prompt [...] only; answer: real answer) later.');
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Highlights.md'))).rejects.toThrow();
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Clozes.md'))).rejects.toThrow();
});


it('exports blank topics as files and skips folders even when both are empty', async () => {
  upsertNodeSnapshot({
    nodeId: 'topic-blank',
    parentNodeId: null,
    kind: 'topic',
    title: 'Blank Topic',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '   ',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'folder-empty',
    parentNodeId: null,
    kind: 'folder',
    title: 'Empty Folder',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '   ',
    reveal: null,
    anchorLink: null,
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

  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Blank Topic.md'), 'utf8')).resolves.toBe('# Blank Topic\n');
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Empty Folder.md'))).rejects.toThrow();
});

it('exports topics inside nested folders using folder directories', async () => {
  upsertNodeSnapshot({
    nodeId: 'folder-root',
    parentNodeId: null,
    kind: 'folder',
    title: 'Projects',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'folder-child',
    parentNodeId: 'folder-root',
    kind: 'folder',
    title: 'Research',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'topic-nested',
    parentNodeId: 'folder-child',
    kind: 'topic',
    title: 'Nested Topic',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Nested body.',
    reveal: null,
    anchorLink: null,
    position: 2,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Projects', 'Research', 'Nested Topic.md'), 'utf8')).resolves.toContain('Nested body.');
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Projects.md'))).rejects.toThrow();
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Projects', 'Research.md'))).rejects.toThrow();
});
