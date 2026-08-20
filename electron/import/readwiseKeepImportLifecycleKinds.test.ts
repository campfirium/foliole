// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-keep-import-lifecycle-kinds-tests';

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: vi.fn(() => true)
}));

import {
  createReadwiseImportSources,
  type ImportManagerSourceDraft,
  type ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';
import { runReadwiseBooksSource } from './readwiseReaderBooksRun.js';

type LifecycleKindCase = {
  folder: string;
  kind: ReadwiseSourceKind;
  title: string;
};

const KIND_CASES: LifecycleKindCase[] = [
  { folder: 'Articles', kind: 'articles', title: 'Sample Article' },
  { folder: 'Books', kind: 'books', title: 'Sample Book' },
  { folder: 'Tweets', kind: 'tweets', title: 'Sample Tweet' },
  { folder: 'Podcasts', kind: 'podcasts', title: 'Sample Podcast' }
];

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-keep-import-lifecycle-kinds-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseKindFixture(readwiseRoot: string, input: LifecycleKindCase) {
  const highlightDir = path.join(readwiseRoot, input.folder);
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', input.folder);
  const sourceName = `${input.title}.md`;
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDocumentDir, sourceName),
    [
      `# ${input.title}`,
      '',
      '## Full Document',
      `Before the quote. ${input.title} highlighted sentence. After the quote.`
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(highlightDir, sourceName),
    [
      `# ${input.title}`,
      '',
      '## Highlights',
      `${input.title} highlighted sentence.`
    ].join('\n'),
    'utf8'
  );
}

async function seedReadwiseFixtures(readwiseRoot: string) {
  await Promise.all(KIND_CASES.map((input) => seedReadwiseKindFixture(readwiseRoot, input)));
}

function saveReadwiseLifecycleSettings(readwiseRoot: string) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightSeparator: '\n\n',
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-05-25T00:00:00.000Z'
    },
    readwiseRootPath: readwiseRoot,
    readwiseSources: createReadwiseImportSources(readwiseRoot).map((source) => ({
      ...source,
      keepState: 'enabled'
    }))
  });
}

function readSource(kind: ReadwiseSourceKind) {
  return createReadwiseImportSources(path.join(tempRoot, 'Readwise')).find(
    (source): source is ImportManagerSourceDraft & { kind: ReadwiseSourceKind } => source.kind === kind
  );
}

async function runReadwiseKindImport(source: ImportManagerSourceDraft & { kind: ReadwiseSourceKind }) {
  if (source.kind === 'books') {
    await runReadwiseBooksSource(source, {
      ...createDefaultReadwiseReaderConfig(),
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only'
    });
    return;
  }
  await runKeepImportRule({
    directoryPath: source.primaryPath,
    highlightPolicy: 'reference_only',
    ruleId: source.id,
    sourceType: 'readwise'
  });
}

function readKeepItem(ruleId: string, sourcePath: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT last_node_id, last_status, local_node_state
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`
    )
    .get(ruleId, sourcePath) as {
      last_node_id: string;
      last_status: string;
      local_node_state: string;
    };
}

it('keeps all Readwise source kinds blocked after local deletion until explicit re-import', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  await seedReadwiseFixtures(readwiseRoot);
  saveReadwiseLifecycleSettings(readwiseRoot);

  for (const input of KIND_CASES) {
    const source = readSource(input.kind);
    expect(source).toBeDefined();
    await runReadwiseKindImport(source!);
  }

  const importedItems = KIND_CASES.map((input) => {
    const source = readSource(input.kind)!;
    const sourcePath = `${input.title}.md`;
    return { input, item: readKeepItem(source.id, sourcePath), source, sourcePath };
  });
  for (const imported of importedItems) {
    expect(imported.item).toEqual({
      last_node_id: expect.any(String),
      last_status: 'imported',
      local_node_state: 'active'
    });
  }

  for (const imported of importedItems) {
    softDeleteNodes({
      deletedAt: '2026-05-25T01:00:00.000Z',
      nodeIds: [imported.item.last_node_id]
    });
  }

  for (const imported of importedItems) {
    await runReadwiseKindImport(imported.source);
  }

  for (const imported of importedItems) {
    expect(readKeepItem(imported.source.id, imported.sourcePath)).toEqual({
      last_node_id: imported.item.last_node_id,
      last_status: 'blocked_deleted',
      local_node_state: 'locally_deleted'
    });
    expect(
      openDatabaseConnection().sqlite
        .prepare('SELECT COUNT(*) AS count FROM nodes WHERE title = ? AND deleted_at IS NULL')
        .get(imported.input.title)
    ).toEqual({ count: 0 });
  }
});
