// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
let documents = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs'),
  documents_dir: documents
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => {}) }));
vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { measureSqlStatements } from '../database/sqlStatementMeter.testSupport.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let sequence = 0;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-read-scale-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  sequence = 0;
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function save(id: string, parentNodeId: string | null, kind: 'folder' | 'topic', title: string, content: string,
  extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  sequence += 1;
  const stamp = new Date(Date.UTC(2026, 9, 6, 0, 0, sequence)).toISOString();
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind, title, isTitleManual: true, hideTitleHeading: false,
    content, reveal: null, anchorLink: null, position: sequence, createdAt: stamp, updatedAt: stamp, ...extra });
}

function seedUnrelatedMaterial(count: number) {
  save('unrelated', null, 'folder', 'Unrelated', '');
  for (let index = 0; index < count; index += 1) {
    save(`other-${index}`, 'unrelated', 'topic', `Other ${index % 5}`, `Other body ${index}.`);
    save(`other-${index}-extract`, `other-${index}`, 'topic', 'Extract', 'Extract body.', {
      anchorLink: { id: `other-${index}-anchor`, kind: 'highlight', locator: { from: 0, to: 5, originalText: 'Other' } }
    });
  }
}

async function measureSingleArticleUpdate(unrelatedCount: number) {
  save('target', null, 'folder', 'Target', '');
  save('article', 'target', 'topic', 'Article', 'First body.');
  save('sibling', 'target', 'topic', 'Sibling', 'Sibling body.');
  seedUnrelatedMaterial(unrelatedCount);
  await rebuildAllMirrorOutput();
  save('article', 'target', 'topic', 'Article', 'Updated body.');
  const { report } = await measureSqlStatements(() => syncIncrementalMirrorOutput(['article']));
  await expect(fs.readFile(path.join(root, 'Library', 'Mirror', 'Target', 'Article.md'), 'utf8'))
    .resolves.toContain('Updated body.');
  return report.rowsRead;
}

it('updates one mirrored article without reading material from unrelated folders', async () => {
  const small = await measureSingleArticleUpdate(20);
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-read-scale-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  sequence = 0;
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  const large = await measureSingleArticleUpdate(60);
  expect(large).toBe(small);
});
