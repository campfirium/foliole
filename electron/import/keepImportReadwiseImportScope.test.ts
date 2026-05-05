// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-import-scope-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { openDatabaseConnection, closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { previewKeepImportRule, runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-import-scope-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseFixtureWithUnhighlightedFile(root: string) {
  const fullDocumentDir = path.join(root, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(root, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDocumentDir, 'Sample Article.md'),
    '## Full Document\n\nBefore the quote. This is the highlighted sentence. After the quote.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(highlightDir, 'Sample Article.md'),
    '# Sample Article\n\n## Highlights\nThis is the highlighted sentence. [...] (https://example.com)\n',
    'utf8'
  );
  await fs.writeFile(path.join(fullDocumentDir, 'Without Highlights.md'), '# Plain article\n\nBody only.\n', 'utf8');
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(root, 'readwise') };
}

function saveReadwiseKeepImportSettings(
  paths: {
    fullDocumentDir: string;
    highlightDir: string;
    readwiseRoot: string;
  },
  importScope: 'all' | 'highlights_only'
) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightSeparator: '\\n\\n',
      highlightsHeading: '## Highlights',
      importScope,
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-26T01:00:00.000Z'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.fullDocumentDir
      }
    ]
  });
}

function readImportedSourceNames() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare('SELECT source_name FROM import_sources ORDER BY source_name ASC')
    .all() as Array<{ source_name: string }>;
}

it('skips readwise files without highlights by default', async () => {
  const fixture = await seedReadwiseFixtureWithUnhighlightedFile(tempRoot);
  saveReadwiseKeepImportSettings(fixture, 'highlights_only');

  const preview = await previewKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  expect(preview.discovered_count).toBe(1);
  expect(preview.entries).toEqual([expect.objectContaining({ source_path: 'Sample Article.md' })]);

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  expect(readImportedSourceNames()).toEqual([{ source_name: 'Sample Article.md' }]);
});

it('imports readwise files without highlights when import all is selected', async () => {
  const fixture = await seedReadwiseFixtureWithUnhighlightedFile(tempRoot);
  saveReadwiseKeepImportSettings(fixture, 'all');

  const preview = await previewKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  expect(preview.discovered_count).toBe(2);

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  expect(readImportedSourceNames()).toEqual([{ source_name: 'Sample Article.md' }, { source_name: 'Without Highlights.md' }]);
});
