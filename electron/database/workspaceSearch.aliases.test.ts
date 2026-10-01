// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let mockedAppDataDir = '/tmp/foliole-workspace-search-query-enhancement-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import { syncNodeSearchIndexForNodeIds, syncPdfSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { reconcileSearchAliasMirror } from './searchAliasMirror.js';
import { saveJsonSetting } from './settingsStore.js';
import { searchWorkspace } from './workspaceSearch.js';
import { insertPdfAttachment } from './workspaceSearchTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-query-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  saveJsonSetting('app_settings', { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' });
  closeDatabaseConnection();
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: { content: string; id: string; title: string; updatedAt: string }) {
  upsertNodeSnapshot({
    nodeId: input.id,
    parentNodeId: null,
    kind: 'topic',
    title: input.title,
    isTitleManual: true,
    content: input.content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: input.updatedAt
  });
  syncNodeSearchIndexForNodeIds(openDatabaseConnection().driver, [input.id]);
}

it('uses aliases in Boolean queries and keeps the matching PDF page for each spelling', async () => {
  saveJsonSetting('search_aliases_document', { version: 1, text: 'Obama | Barack Obama\nhealthcare | health care\n' });
  await reconcileSearchAliasMirror();
  insertNode({ id: 'original', title: 'Original', content: 'Obama described healthcare.', updatedAt: '2026-05-01T00:00:00.000Z' });
  insertNode({ id: 'alias', title: 'Alias', content: 'Barack Obama described health care.', updatedAt: '2026-05-02T00:00:00.000Z' });
  insertNode({ id: 'substring', title: 'Substring', content: 'Obamacare described health care.', updatedAt: '2026-05-03T00:00:00.000Z' });
  insertNode({ id: 'pdf-holder', title: 'PDF Holder', content: '', updatedAt: '2026-05-04T00:00:00.000Z' });
  insertPdfAttachment({ nodeId: 'pdf-holder', id: 'ffa5f1b464b24c8c9e77f7f70d3ee68d6cde10311d33ec9271f664a9fa0ae5e5', originalName: 'Speech.pdf', status: 'ready' });
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)')
    .run('ffa5f1b464b24c8c9e77f7f70d3ee68d6cde10311d33ec9271f664a9fa0ae5e5', 1, 'Barack Obama discussed health care.');
  sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)')
    .run('ffa5f1b464b24c8c9e77f7f70d3ee68d6cde10311d33ec9271f664a9fa0ae5e5', 2, 'Obama discussed healthcare.');
  syncPdfSearchIndexForNodeIds(openDatabaseConnection().driver, ['pdf-holder']);

  const results = searchWorkspace('Obama AND healthcare');
  expect(results.map((result) => result.id)).not.toContain('substring');
  expect(results.indexOf(results.find((result) => result.id === 'original')!))
    .toBeLessThan(results.indexOf(results.find((result) => result.id === 'alias')!));
  const alias = results.find((result) => result.id === 'alias')!;
  expect(alias.nodeMatch).toMatchObject({ query: 'Barack Obama' });
  const pdf = results.find((result) => result.kind === 'pdf' && result.id === 'pdf-holder')!;
  expect(pdf.aliasMatches?.find((item) => item.spelling === 'barack obama')?.pdfMatch)
    .toMatchObject({ page: 1, query: 'Barack Obama' });
  expect(pdf.aliasMatches?.find((item) => item.spelling === 'obama')?.pdfMatch)
    .toMatchObject({ page: 2, query: 'Obama' });
});

it('returns every ordinary and aliased result after the former workspace limits', async () => {
  saveJsonSetting('search_aliases_document', { version: 1, text: 'Atlas | Mapbook\n' });
  await reconcileSearchAliasMirror();
  for (let index = 0; index < 505; index += 1) {
    const name = index < 490 ? 'Atlas' : 'Mapbook';
    insertNode({ id: `bulk-${index}`, title: `${name} ${index}`, content: `${name} catalogue entry`, updatedAt: '2026-05-01T00:00:00.000Z' });
  }
  expect(searchWorkspace('catalogue').filter((result) => result.kind === 'node')).toHaveLength(505);
  expect(searchWorkspace('Atlas').filter((result) => result.kind === 'node')).toHaveLength(505);
});

it('keeps original text offsets for accented word-based index matches', async () => {
  saveJsonSetting('app_settings', { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'word-based' });
  closeDatabaseConnection();
  initializeDatabase();
  saveJsonSetting('search_aliases_document', { version: 1, text: 'cafe | coffee\n' });
  await reconcileSearchAliasMirror();
  insertNode({ id: 'accented', title: 'Entry', content: 'A café appeared here.', updatedAt: '2026-05-01T00:00:00.000Z' });
  insertNode({ id: 'alias', title: 'Other', content: 'A coffee appeared here.', updatedAt: '2026-05-02T00:00:00.000Z' });

  const results = searchWorkspace('cafe');
  const accented = results.find((result) => result.id === 'accented')!;
  expect(accented.nodeMatch).toMatchObject({ from: 2, to: 6, query: 'café' });
  expect(results.map((result) => result.id)).toEqual(['accented', 'alias']);
});
