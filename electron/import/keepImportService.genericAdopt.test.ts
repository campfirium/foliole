// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-generic-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { discoverDirectoryImportSources } from '../ipc/importSourcePipeline.js';

import { runSingleKeepImportSource } from './keepImportRunSource.js';
import { previewKeepImportRule, runKeepImportRule } from './keepImportService.js';
import { createGenericKeepImportConfig, mapChildRowsWithAnchorLink, parseAnchorLink, readSplitChildren, seedGenericSplitSidecarFixture } from './keepImportService.test-support.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-generic-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

it('notifies the renderer after keep imports write a new record', async () => {
  await fs.writeFile(path.join(tempRoot, 'entry.md'), '# Imported\nBody\n', 'utf8');

  await runKeepImportRule(createGenericKeepImportConfig(tempRoot, 'draft-import-source-301'));

  expect(notifyManagedInboxUpdated).toHaveBeenCalledTimes(1);
  expect(notifyManagedInboxUpdated.mock.calls[0]?.[0]).toEqual(expect.stringMatching(/^import-/));
});

it('adopts inline markdown highlights for generic merged keep imports', async () => {
  const sourceDir = path.join(tempRoot, 'merged-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), 'Before ==important== after', 'utf8');

  const preview = await previewKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101', 'adopt'));

  expect(preview.entries).toEqual([
    expect.objectContaining({
      content_preview: 'Before important after',
      detected_highlight_count: 1,
      highlight_samples: [
        expect.objectContaining({
          highlightText: 'important',
          matched: true,
          sourceName: 'entry.md'
        })
      ],
      source_path: 'entry.md',
      status: 'new'
    })
  ]);

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101', 'adopt'));

  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT nodes.id, ${buildNodeBodyContentSql('nodes')} AS content
       FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash
       WHERE nodes.title = 'entry'
       ORDER BY nodes.created_at DESC
       LIMIT 1`
    )
    .get() as { content: string; id: string };
  const childRows = openDatabaseConnection().sqlite
    .prepare(`SELECT nodes.title, ${buildNodeBodyContentSql('nodes')} AS content, nodes.anchor_link FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash WHERE nodes.parent_id = ? ORDER BY nodes.created_at ASC`)
    .all(row.id) as Array<{ anchor_link: string | null; content: string; title: string }>;
  const anchorLink = parseAnchorLink(childRows[0]!.anchor_link!);

  expect(row.content).toBe('Before important after');
  expect(mapChildRowsWithAnchorLink(childRows as Array<{ anchor_link: string | null; content: string; title: string }>)).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: anchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'important' })
      }),
      content: 'important',
      title: 'important'
    }
  ]);
});

it('keeps preview samples available for already imported unchanged files', async () => {
  const sourceDir = path.join(tempRoot, 'merged-source-repeat');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), 'Before ==important== after', 'utf8');

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-104', 'adopt'));

  const repeatedPreview = await previewKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-104', 'adopt'));
  expect(repeatedPreview.entries).toEqual([
    expect.objectContaining({
      detail: 'This document is already imported and has no file changes.',
      detected_highlight_count: 1,
      highlight_samples: [
        expect.objectContaining({
          excerpt: 'Before important after',
          highlightText: 'important',
          matched: true,
          sourceName: 'entry.md'
        })
      ],
      source_path: 'entry.md',
      status: 'unchanged'
    })
  ]);
});

it('stores a shortened derived cache preview beside the full import content', async () => {
  const sourceDir = path.join(tempRoot, 'long-source');
  const opening = Array.from({ length: 40 }, (_, index) => `Opening sentence ${index + 1}`).join(' ');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), `# Long Entry\n\n${opening}\n\nFinal paragraph kept in full content.`, 'utf8');

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-103'));

  const cacheRow = openDatabaseConnection().sqlite
    .prepare(`SELECT content, content_preview FROM keep_import_item_cache WHERE rule_id = ? AND source_path = ?`)
    .get('draft-import-source-103', 'entry.md') as { content: string; content_preview: string };

  expect(cacheRow.content).toContain('Final paragraph kept in full content.');
  expect(cacheRow.content_preview).toContain('Opening sentence 1');
  expect(cacheRow.content_preview.length).toBeLessThan(cacheRow.content.length);
  expect(cacheRow.content_preview).not.toBe(cacheRow.content);
});

it('previews both matched and unmatched generic split sidecar highlights', async () => {
  const { highlightDir, sourceDir } = await seedGenericSplitSidecarFixture(tempRoot);
  const config = createGenericKeepImportConfig(sourceDir, 'draft-import-source-102', 'reference_only', highlightDir);
  const preview = await previewKeepImportRule(config);

  expect(preview.entries).toEqual([
    expect.objectContaining({
      detected_highlight_count: 2,
      highlight_samples: [
        expect.objectContaining({
          highlightText: 'matching highlight',
          matched: true,
          sourceName: 'entry.md'
        }),
        expect.objectContaining({
          highlightText: 'missing highlight',
          matched: false,
          sourceName: 'entry.md'
        })
      ],
      source_path: 'entry.md',
      status: 'new'
    })
  ]);
});

it('retains unmatched generic split highlights independently through reopen and explicit refresh', async () => {
  const { highlightDir, sourceDir } = await seedGenericSplitSidecarFixture(tempRoot);
  const config = createGenericKeepImportConfig(sourceDir, 'draft-import-source-102', 'reference_only', highlightDir);
  await runKeepImportRule(config);

  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT nodes.id, ${buildNodeBodyContentSql('nodes')} AS content
       FROM import_sources
       JOIN nodes ON nodes.id = import_sources.latest_node_id LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash
       WHERE import_sources.source_name = 'entry.md'`
    )
    .get() as { content: string; id: string };
  const childRows = readSplitChildren(row.id);

  expect(row.content).toContain('Before matching highlight after.');
  expect(mapChildRowsWithAnchorLink(childRows)).toEqual([
    {
      anchorLink: expect.objectContaining({
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'matching highlight' })
      }),
      content: 'matching highlight',
      title: 'matching highlight'
    },
    { anchorLink: null, content: 'missing highlight', title: 'missing highlight' }
  ]);

  closeDatabaseConnection();
  expect(readSplitChildren(row.id)).toEqual(childRows);
  await runKeepImportRule(config);
  expect(readSplitChildren(row.id)).toEqual(childRows);

  await fs.writeFile(path.join(highlightDir, 'entry.md'), '- missing highlight\n\n- matching highlight\n\n- Other body.');
  const [source] = await discoverDirectoryImportSources(sourceDir);
  await runSingleKeepImportSource(config, source!, { forceTopicImport: true });
  const refreshed = readSplitChildren(row.id);
  expect(refreshed.map(child => child.content)).toEqual(['matching highlight', 'Other body.', 'missing highlight']);
  expect(refreshed.filter(child => child.content !== 'Other body.').map(child => child.id)).toEqual(childRows.map(child => child.id));
  expect(refreshed.at(-1)?.anchor_link).toBeNull();
  closeDatabaseConnection();
  expect(readSplitChildren(row.id)).toEqual(refreshed);
  await runKeepImportRule(config);
  expect(readSplitChildren(row.id)).toEqual(refreshed);
});

it('retains every generic sidecar excerpt when none match the source body', async () => {
  const { highlightDir, sourceDir } = await seedGenericSplitSidecarFixture(tempRoot);
  await fs.writeFile(path.join(sourceDir, 'entry.md'), 'A body without either excerpt.');
  const config = createGenericKeepImportConfig(sourceDir, 'draft-import-source-105', 'reference_only', highlightDir);
  await runKeepImportRule(config);
  const row = openDatabaseConnection().sqlite.prepare(
    "SELECT latest_node_id AS id FROM import_sources WHERE source_name = 'entry.md'"
  ).get() as { id: string };
  const children = readSplitChildren(row.id);
  expect(mapChildRowsWithAnchorLink(children)).toEqual([
    { anchorLink: null, content: 'matching highlight', title: 'matching highlight' },
    { anchorLink: null, content: 'missing highlight', title: 'missing highlight' }
  ]);
  closeDatabaseConnection();
  expect(readSplitChildren(row.id)).toEqual(children);
  await runKeepImportRule(config);
  expect(readSplitChildren(row.id)).toEqual(children);
});
