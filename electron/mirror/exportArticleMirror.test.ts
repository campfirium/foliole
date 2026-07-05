// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-export-article-mirror-app-data';
let mockedDocumentsDir = '/tmp/foliole-export-article-mirror-documents';

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

import {
  exportArticleToMirror,
  loadArticleNode,
  renderArticleMirrorMarkdown,
  resolveArticleIdFromNodeId
} from './exportArticleMirror.js';
import {
  seedArticleWithAdjacentLocatorHighlights,
  seedArticleWithLocatorHighlight,
  seedArticleWithOverlappingLocatorHighlights,
  seedArticleWithUnresolvedLocatorHighlight
} from './exportArticleMirror.testSupport.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-export-article-mirror-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('renders article markdown when derived children use text locator payloads', () => {
  seedArticleWithLocatorHighlight();

  const articleRow = loadArticleNode('node-article');
  expect(articleRow).not.toBeNull();
  if (!articleRow) {
    throw new Error('expected article row');
  }

  expect(renderArticleMirrorMarkdown(articleRow)).toContain('Keep ==bright text== here.');
});

it('preserves overlapping locator-backed highlights when exporting article markdown', () => {
  seedArticleWithOverlappingLocatorHighlights();

  const articleRow = loadArticleNode('node-article-overlap');
  expect(articleRow).not.toBeNull();
  if (!articleRow) {
    throw new Error('expected article row');
  }

  const output = renderArticleMirrorMarkdown(articleRow);
  expect(output).toContain('==AB==C==DE==');
  expect(output).not.toContain('<highlight');
});

it('keeps adjacent locator-backed highlights as separate spans when exporting article markdown', () => {
  seedArticleWithAdjacentLocatorHighlights();

  const articleRow = loadArticleNode('node-article-adjacent');
  expect(articleRow).not.toBeNull();
  if (!articleRow) {
    throw new Error('expected article row');
  }

  const output = renderArticleMirrorMarkdown(articleRow);
  expect(output).toContain('==AB====CD==E');
  expect(output).not.toContain('<highlight');
});

it('resolves article ownership from derived nodes with text locator payloads', () => {
  seedArticleWithLocatorHighlight();

  expect(resolveArticleIdFromNodeId('node-highlight')).toBe('node-article');
});

it('exports article files when database rows contain text locator payloads', async () => {
  seedArticleWithLocatorHighlight();

  await expect(exportArticleToMirror('node-article')).resolves.toBe(true);

  const outputPath = path.join(tempRoot, 'Library', 'Mirror', 'Mirror Export Demo.md');
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toContain('Keep ==bright text== here.');
});

it('does not export unresolved zero-width locator highlights back into article markdown', () => {
  seedArticleWithUnresolvedLocatorHighlight();

  const articleRow = loadArticleNode('node-article-unresolved');
  expect(articleRow).not.toBeNull();
  if (!articleRow) {
    throw new Error('expected article row');
  }

  expect(renderArticleMirrorMarkdown(articleRow)).toBe('# Mirror Export Unresolved Demo\n\nKeep  here.\n');
});

it('exports unresolved zero-width locator articles without reintroducing inline highlight markup', async () => {
  seedArticleWithUnresolvedLocatorHighlight();

  await expect(exportArticleToMirror('node-article-unresolved')).resolves.toBe(true);

  const outputPath = path.join(tempRoot, 'Library', 'Mirror', 'Mirror Export Unresolved Demo.md');
  const output = await fs.readFile(outputPath, 'utf8');
  expect(output).toBe('# Mirror Export Unresolved Demo\n\nKeep  here.\n');
  expect(output).not.toContain('<highlight');
  expect(output).not.toContain('==bright text==');
});
function saveMirrorNode(args: {
  content?: string;
  kind?: 'folder' | 'item' | 'topic';
  nodeId: string;
  parentNodeId: string | null;
  title: string;
  updatedAt: string;
}) {
  upsertNodeSnapshot({
    nodeId: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: args.kind ?? 'topic',
    title: args.title,
    isTitleManual: true,
    hideTitleHeading: false,
    content: args.content ?? '',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: args.updatedAt
  });
}

it('removes stale empty parent folders when an article mirror moves path', async () => {
  saveMirrorNode({ kind: 'folder', nodeId: 'folder-old', parentNodeId: null, title: 'Old Folder', updatedAt: '2026-03-30T00:00:00.000Z' });
  saveMirrorNode({ kind: 'folder', nodeId: 'folder-new', parentNodeId: null, title: 'New Folder', updatedAt: '2026-03-30T00:00:00.000Z' });
  saveMirrorNode({ content: 'Moving body.', nodeId: 'node-moving', parentNodeId: 'folder-old', title: 'Moving Topic', updatedAt: '2026-03-30T00:00:00.000Z' });

  await expect(exportArticleToMirror('node-moving')).resolves.toBe(true);
  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Old Folder', 'Moving Topic.md'), 'utf8')).resolves.toContain('Moving body.');

  saveMirrorNode({ content: 'Moving body.', nodeId: 'node-moving', parentNodeId: 'folder-new', title: 'Moving Topic', updatedAt: '2030-03-30T00:00:00.000Z' });

  await expect(exportArticleToMirror('node-moving')).resolves.toBe(true);
  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'New Folder', 'Moving Topic.md'), 'utf8')).resolves.toContain('Moving body.');
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Old Folder'))).rejects.toThrow();
});
