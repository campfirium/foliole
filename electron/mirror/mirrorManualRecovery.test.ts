// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
let documents = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs'), documents_dir: documents
}) }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));
vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { deleteNodesPermanently, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { resumePendingMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';
import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';

let root = '';
const sourceTime = '2020-01-01T00:00:00.000Z';

function save(id: string, content: string, updatedAt = sourceTime, parentNodeId: string | null = null) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind: 'topic', title: id, isTitleManual: true,
    hideTitleHeading: false, content, reveal: null, position: 0, createdAt: sourceTime, updatedAt,
    anchorLink: parentNodeId ? { id: `${id}-anchor`, kind: 'highlight',
      locator: { from: 0, to: 5, originalText: 'Alpha' } } : null });
}

function output(id: string) {
  return path.join(root, 'Library', 'Mirror', loadMirrorArticleRecords().get(id)!.relativePath);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-recovery-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  save('owner', 'Alpha original source');
  save('derived', 'Alpha\n※ Retired child note.', sourceTime, 'owner');
  save('unrelated', 'Unrelated saved fact.');
  await rebuildMirrorOutput();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it.each(['missing', 'older-source', 'deleted-child'] as const)(
  'rebuilds current SQLite facts after reopening with %s output left behind', async (mode) => {
    const before = loadMirrorArticleRecords().get('owner')!;
    const ownerBefore = loadWorkspaceNodeDocument('owner')!;
    const unrelated = await fs.readFile(output('unrelated'), 'utf8');
    const outside = path.join(root, 'Library', 'outside-mirror.md');
    await fs.writeFile(outside, 'Protected outside mirror');
    const stale = path.join(root, 'Library', 'Mirror', 'retired', 'stale.md');
    await fs.mkdir(path.dirname(stale), { recursive: true });
    await fs.writeFile(stale, 'Retired output');
    if (mode === 'missing') save('missing', 'Saved before any mirror exists.');
    if (mode === 'older-source') save('owner', 'Alpha Current SQLite body with an older source date.');
    if (mode === 'deleted-child') {
      softDeleteNodes({ nodeIds: ['derived'], deletedAt: new Date().toISOString() });
      deleteNodesPermanently({ nodeIds: ['derived'] });
      expect(loadWorkspaceNodeDocument('owner')).toEqual(ownerBefore);
    }
    // Reopen persisted SQLite without consuming the discarded session's notifications.
    closeDatabaseConnection();
    initializeDatabase();
    expect(loadMirrorArticleRecords().get('owner')).toEqual(before);
    if (mode === 'missing') expect(loadMirrorArticleRecords().has('missing')).toBe(false);
    else {
      expect(before.mirroredAt > sourceTime).toBe(true);
      await resumePendingMirrorOutput();
      const staleBody = await fs.readFile(output('owner'), 'utf8');
      expect(staleBody).toContain(mode === 'older-source' ? 'original source' : 'Retired child note.');
    }
    const result = await rebuildMirrorOutput();
    expect(result).toMatchObject({ failed_article_count: 0, pending_article_count: 0 });
    const body = await fs.readFile(output(mode === 'missing' ? 'missing' : 'owner'), 'utf8');
    if (mode === 'missing') expect(body).toContain('Saved before any mirror exists.');
    if (mode === 'older-source') expect(body).toContain('Current SQLite body with an older source date.');
    if (mode === 'deleted-child') {
      expect(body).toContain('Alpha original source');
      expect(body).not.toContain('Retired child note.');
      expect(loadWorkspaceNodeDocument('derived')).toBeNull();
    }
    expect(await fs.readFile(output('unrelated'), 'utf8')).toBe(unrelated);
    expect(await fs.readFile(outside, 'utf8')).toBe('Protected outside mirror');
    await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(loadMirrorArticleRecords().get('owner')!.mirroredAt >= before.mirroredAt).toBe(true);
  }
);
