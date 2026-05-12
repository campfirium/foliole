// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-sync-preview-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { upsertKeepImportItem } from '../database/keepImportItems.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';
import { previewReadwiseReaderImport } from './readwiseSyncPreview.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-sync-preview-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseFixture() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightPath = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(path.join(primaryPath, 'Highlighted.md'), '# Highlighted\n\nBefore important sentence after.\n', 'utf8');
  await fs.writeFile(path.join(highlightPath, 'Highlighted.md'), '# Highlighted\n\n## Highlights\nimportant sentence\n', 'utf8');
  await fs.writeFile(path.join(primaryPath, 'Plain.md'), '# Plain\n\nNo sidecar highlights.\n', 'utf8');
  return { highlightPath, primaryPath, readwiseRoot };
}

function saveReadwiseSettings(
  paths: Awaited<ReturnType<typeof seedReadwiseFixture>>,
  behavior: { withHighlightsDestination: 'external' | 'inbox'; withoutHighlightsDestination: 'external' | 'inbox' | 'off' }
) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      ...behavior,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightPath,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.primaryPath
      }
    ]
  });
}

it('previews Readwise sources with highlight type and destination', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'external', withoutHighlightsDestination: 'off' });

  const preview = await previewReadwiseReaderImport();

  expect(preview).toMatchObject({
    external_count: 1,
    inbox_count: 0,
    off_count: 1,
    total_count: 2,
    with_highlights_count: 1,
    without_highlights_count: 1,
    write_count: 1
  });
  expect(preview.entries).toEqual([
    expect.objectContaining({
      destination: 'external',
      detected_highlight_count: 1,
      highlight_type: 'with_highlights',
      source_path: 'Highlighted.md',
      status: 'new'
    }),
    expect.objectContaining({
      destination: 'off',
      highlight_type: 'without_highlights',
      source_path: 'Plain.md',
      status: 'off'
    })
  ]);
});

it('does not scan Readwise sources when Reader is disabled', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'external', withoutHighlightsDestination: 'off' });
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: false,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z'
    },
    readwiseRootPath: fixture.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: fixture.highlightPath,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: fixture.primaryPath
      }
    ]
  });

  await expect(previewReadwiseReaderImport()).resolves.toMatchObject({
    entries: [],
    total_count: 0,
    write_count: 0
  });
});

it('counts external no-highlight sources as writes when configured', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'external' });

  await expect(previewReadwiseReaderImport()).resolves.toMatchObject({
    external_count: 1,
    inbox_count: 1,
    off_count: 0,
    write_count: 2
  });
});

it('marks tracked unchanged sources without writing during preview', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });
  const primaryStats = await fs.stat(path.join(fixture.primaryPath, 'Highlighted.md'));
  const highlightStats = await fs.stat(path.join(fixture.highlightPath, 'Highlighted.md'));
  upsertKeepImportItem({
    hasSourceUpdate: false,
    highlightSourceMtimeMs: highlightStats.mtimeMs,
    highlightSourceSizeBytes: highlightStats.size,
    lastImportedAt: '2026-05-11T00:00:00.000Z',
    lastNodeId: null,
    lastSeenAt: '2026-05-11T00:00:00.000Z',
    lastStatus: 'imported',
    ruleId: 'draft-import-source-1',
    sourceMtimeMs: primaryStats.mtimeMs,
    sourcePath: 'Highlighted.md',
    sourceSizeBytes: primaryStats.size
  });

  const preview = await previewReadwiseReaderImport();

  expect(preview.entries).toContainEqual(expect.objectContaining({ source_path: 'Highlighted.md', status: 'unchanged' }));
});

it('marks locally deleted Readwise sources as blocked instead of new', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });
  await runReadwiseReaderImport();
  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE source_path = 'Highlighted.md'`)
    .get() as { last_node_id: string };
  softDeleteNodes({
    deletedAt: '2026-05-12T00:00:00.000Z',
    nodeIds: [importedNode.last_node_id]
  });

  const preview = await previewReadwiseReaderImport();

  expect(preview).toMatchObject({ blocked_count: 1, removed_import_count: 0, trash_count: 1, write_count: 0 });
  expect(preview.entries).toContainEqual(
    expect.objectContaining({
      blocked_location: 'trash',
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      source_path: 'Highlighted.md',
      status: 'blocked_deleted'
    })
  );
});

it('counts hard-deleted Readwise sources as removed imports during preview', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' });
  await runReadwiseReaderImport();
  openDatabaseConnection().sqlite
    .prepare(
      `UPDATE keep_import_items
       SET last_node_id = 'missing-node', local_node_state = 'locally_deleted', last_status = 'blocked_deleted'
       WHERE source_path = 'Highlighted.md'`
    )
    .run();

  const preview = await previewReadwiseReaderImport();

  expect(preview).toMatchObject({ blocked_count: 1, removed_import_count: 1, trash_count: 0, write_count: 0 });
  expect(preview.entries).toContainEqual(
    expect.objectContaining({
      blocked_location: 'removed_import',
      source_path: 'Highlighted.md',
      status: 'blocked_deleted'
    })
  );
});

it('returns a failed entry when a configured Readwise folder cannot be scanned', async () => {
  const fixture = await seedReadwiseFixture();
  const invalidPrimaryPath = path.join(tempRoot, 'readwise-file-instead-of-folder.md');
  await fs.writeFile(invalidPrimaryPath, 'not a folder', 'utf8');
  saveReadwiseSettings(
    { ...fixture, primaryPath: invalidPrimaryPath },
    { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' }
  );

  await expect(previewReadwiseReaderImport()).resolves.toMatchObject({
    failed_count: 1,
    total_count: 1,
    write_count: 0
  });
});
