// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-export-article-mirror-unresolved-cloze-app-data';
let mockedDocumentsDir = '/tmp/foliole-export-article-mirror-unresolved-cloze-documents';

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

import { exportArticleToMirror, loadArticleNode, renderArticleMirrorMarkdown } from './exportArticleMirror.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-export-article-mirror-unresolved-cloze-'));
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

function seedArticleWithUnresolvedLocatorCloze() {
  upsertNodeSnapshot({
    nodeId: 'node-article-unresolved-cloze',
    parentNodeId: null,
    kind: 'topic',
    title: 'Mirror Export Unresolved Cloze Demo',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Study  today.',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-unresolved-cloze',
    parentNodeId: 'node-article-unresolved-cloze',
    kind: 'item',
    title: 'Study [...] today.',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Study [...] today.',
    reveal: 'answer',
    anchorLink: {
      id: 'cloze-missing',
      kind: 'cloze',
      locator: {
        from: 6,
        to: 6,
        originalText: 'answer'
      }
    },
    position: 1,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  });
}

it('does not export unresolved zero-width locator clozes back into article markdown', () => {
  seedArticleWithUnresolvedLocatorCloze();

  const articleRow = loadArticleNode('node-article-unresolved-cloze');
  expect(articleRow).not.toBeNull();
  if (!articleRow) {
    throw new Error('expected article row');
  }

  expect(renderArticleMirrorMarkdown(articleRow)).toBe('# Mirror Export Unresolved Cloze Demo\n\nStudy  today.\n');
});

it('exports unresolved zero-width locator cloze articles without reintroducing inline cloze markup', async () => {
  seedArticleWithUnresolvedLocatorCloze();

  await expect(exportArticleToMirror('node-article-unresolved-cloze')).resolves.toBe(true);

  const outputPath = path.join(tempRoot, 'Library', 'Mirror', 'Mirror Export Unresolved Cloze Demo.md');
  const output = await fs.readFile(outputPath, 'utf8');
  expect(output).toBe('# Mirror Export Unresolved Cloze Demo\n\nStudy  today.\n');
  expect(output).not.toContain('<cloze');
  expect(output).not.toContain('[...]');
});
