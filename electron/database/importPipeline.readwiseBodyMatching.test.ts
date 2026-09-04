// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-body-matching-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-body-matching-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepared(author: string, highlights: string[], importedAt: string) {
  return createPreparedDesktopTextImport({
    content: [
      '---',
      `author: ${author}`,
      '---',
      '',
      '# Heading target',
      '',
      'First body target.',
      '',
      'Second body target.'
    ].join('\n'),
    fileName: 'readwise.md',
    filePath: '/tmp/readwise.md',
    highlightSidecar: highlights.map((text) => ({ text })),
    importedAt,
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
}

function readChildren(parentNodeId: string) {
  return openDatabaseConnection().driver.queryAll<{
    anchor_link: string | null;
    content: string;
  }>('SELECT content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC', [parentNodeId]);
}

function assertRealBodyLocator(parentContent: string, anchorLink: string | null, text: string) {
  const anchor = JSON.parse(anchorLink ?? '{}') as {
    locator?: { from: number; originalText: string; to: number };
  };
  expect(anchor.locator).toEqual({
    from: parentContent.indexOf(text),
    originalText: text,
    to: parentContent.indexOf(text) + text.length
  });
}

it('keeps title matches unmapped across first, duplicate, and incremental Readwise imports', () => {
  const first = runPreparedImport(prepared(
    'Initial',
    ['Heading target', 'First body target.'],
    '2026-09-04T05:00:00.000Z'
  ));
  if (!first.nodeId) throw new Error('expected imported node');

  const duplicate = runPreparedImport(prepared(
    'Initial',
    ['Heading target', 'First body target.'],
    '2026-09-04T05:05:00.000Z'
  ));
  const updated = runPreparedImport(prepared(
    'Updated',
    ['Heading target', 'First body target.', 'Second body target.'],
    '2026-09-04T05:10:00.000Z'
  ));
  const parent = openDatabaseConnection().driver.queryOne<{ content: string }>(
    'SELECT content FROM nodes WHERE id = ?', [first.nodeId]
  );
  const children = readChildren(first.nodeId);

  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(updated.duplicateSemantic).toBe('updated');
  expect(children.map((child) => child.content)).toEqual(expect.arrayContaining([
    'Heading target', 'First body target.', 'Second body target.'
  ]));
  expect(children).toHaveLength(3);
  expect(children.find((child) => child.content === 'Heading target')?.anchor_link).toBeNull();
  assertRealBodyLocator(parent?.content ?? '',
    children.find((child) => child.content === 'First body target.')?.anchor_link ?? null, 'First body target.');
  assertRealBodyLocator(parent?.content ?? '',
    children.find((child) => child.content === 'Second body target.')?.anchor_link ?? null, 'Second body target.');
});
