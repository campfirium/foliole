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

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-export-article-mirror-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedArticleWithLocatorHighlight() {
  upsertNodeSnapshot({
    nodeId: 'node-article',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Export Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Keep bright text here.',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-highlight',
    parentNodeId: 'node-article',
    kind: 'topic',
    title: 'bright text',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'bright text',
    reveal: null,
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 5,
        to: 16,
        originalText: 'bright text'
      }
    },
    position: 1,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
}

function seedArticleWithOverlappingLocatorHighlights() {
  upsertNodeSnapshot({
    nodeId: 'node-article-overlap',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Export Overlap Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'ABCDE',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-highlight-overlap-1',
    parentNodeId: 'node-article-overlap',
    kind: 'topic',
    title: 'ABC',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'ABC',
    reveal: null,
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 0,
        to: 3,
        originalText: 'ABC'
      }
    },
    position: 1,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-highlight-overlap-2',
    parentNodeId: 'node-article-overlap',
    kind: 'topic',
    title: 'CDE',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'CDE',
    reveal: null,
    anchorLink: {
      id: 'hl-2',
      kind: 'highlight',
      locator: {
        from: 2,
        to: 5,
        originalText: 'CDE'
      }
    },
    position: 2,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
}

function seedArticleWithAdjacentLocatorHighlights() {
  upsertNodeSnapshot({
    nodeId: 'node-article-adjacent',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Export Adjacent Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'ABCDE',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-highlight-adjacent-1',
    parentNodeId: 'node-article-adjacent',
    kind: 'topic',
    title: 'AB',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'AB',
    reveal: null,
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 0,
        to: 2,
        originalText: 'AB'
      }
    },
    position: 1,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-highlight-adjacent-2',
    parentNodeId: 'node-article-adjacent',
    kind: 'topic',
    title: 'CD',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'CD',
    reveal: null,
    anchorLink: {
      id: 'hl-2',
      kind: 'highlight',
      locator: {
        from: 2,
        to: 4,
        originalText: 'CD'
      }
    },
    position: 2,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
}

function seedArticleWithUnresolvedLocatorHighlight() {
  upsertNodeSnapshot({
    nodeId: 'node-article-unresolved',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Export Unresolved Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Keep  here.',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-unresolved-highlight',
    parentNodeId: 'node-article-unresolved',
    kind: 'topic',
    title: 'bright text',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'bright text',
    reveal: null,
    anchorLink: {
      id: 'hl-missing',
      kind: 'highlight',
      locator: {
        from: 5,
        to: 5,
        originalText: 'bright text'
      }
    },
    position: 1,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
}

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

  expect(renderArticleMirrorMarkdown(articleRow)).toContain(
    '<highlight id="hl-1">AB<highlight id="hl-2">C</highlight id="hl-1">DE</highlight id="hl-2">'
  );
});

it('keeps adjacent locator-backed highlights as separate spans when exporting article markdown', () => {
  seedArticleWithAdjacentLocatorHighlights();

  const articleRow = loadArticleNode('node-article-adjacent');
  expect(articleRow).not.toBeNull();
  if (!articleRow) {
    throw new Error('expected article row');
  }

  expect(renderArticleMirrorMarkdown(articleRow)).toContain(
    '<highlight id="hl-1">AB</highlight id="hl-1"><highlight id="hl-2">CD</highlight id="hl-2">E'
  );
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
