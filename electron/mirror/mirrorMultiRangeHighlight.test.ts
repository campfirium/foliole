// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
let documents = '';
const { showSaveDialog } = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs'), documents_dir: documents
}) }));
vi.mock('electron', () => ({ dialog: { showSaveDialog }, BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { exportCurrentArticleMirror } from './exportCurrentArticleMirror.js';
import { resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let outputPath = '';

function save(id: string, content: string, parentNodeId: string | null = null,
  extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind: 'item', title: id, isTitleManual: true,
    hideTitleHeading: false, content, reveal: 'Saved answer fact.', anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z', ...extra });
}
function mirror(id: string) {
  const record = loadMirrorArticleRecords().get(id)!;
  return path.join(root, 'Library', 'Mirror', record.relativePath);
}
async function syncFrom(id: string) {
  const ids = resolveArticleIdsFromNodeId(id);
  expect(ids).toEqual(['manual']);
  return syncIncrementalMirrorOutput(ids);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-manual-item-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  outputPath = path.join(root, 'Export', 'article.md');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  showSaveDialog.mockReset().mockResolvedValue({ canceled: false, filePath: outputPath });
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

const ranges = [
  { from: 0, to: 5, originalText: 'Alpha' },
  { from: 11, to: 16, originalText: 'Gamma' }
];
function saveHighlight(selected = ranges, content = 'Alpha\nGamma') {
  save('highlight', content, 'manual', { kind: 'topic', reveal: null,
    anchorLink: { id: 'multi', kind: 'highlight', locator: { ranges: selected } } });
}
async function expectAllPaths() {
  await syncFrom('highlight');
  const automatic = await fs.readFile(mirror('manual'), 'utf8');
  await exportCurrentArticleMirror('manual', null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toBe(automatic);
  return automatic;
}

it('marks every saved range while keeping a shared annotation once through all output paths', async () => {
  save('manual', 'Alpha Beta Gamma Delta', null, { kind: 'topic', reveal: null });
  saveHighlight(ranges, 'Alpha\nGamma\n※ Shared note.');
  const body = await expectAllPaths();
  expect(body).toContain('==Alpha==');
  expect(body).toContain('==Gamma==');
  expect(body.match(/Shared note\./g)).toHaveLength(1);
});

it.each([
  { source: 'Alpha Beta  Delta', selected: [ranges[0]!, { ...ranges[1]!, to: 11 }] },
  { source: 'Unrelated replacement.', selected: ranges },
  { source: '', selected: ranges }
])('retains original text and the note when saved ranges cannot be embedded: $source', async ({ source, selected }) => {
  save('manual', source, null, { kind: 'topic', reveal: null });
  saveHighlight(selected, 'Edited annotation only.');
  const body = await expectAllPaths();
  expect(body).toContain('Alpha');
  expect(body).toContain('Gamma');
  expect(body.match(/Edited annotation only\./g)).toHaveLength(1);
  expect(body).not.toContain('==Unrel==');
});

it('removes and restores all ranges with the saved highlight without rewriting unrelated output', async () => {
  save('manual', 'Alpha Beta Gamma Delta', null, { kind: 'topic', reveal: null });
  saveHighlight();
  save('unrelated', 'Unrelated body.', null, { kind: 'topic', reveal: null });
  await rebuildAllMirrorOutput();
  const file = mirror('unrelated');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  softDeleteNodes({ nodeIds: ['highlight'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('manual');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.not.toContain('==');
  restoreNodes({ nodeIds: ['highlight'] });
  await syncFrom('highlight');
  const body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('==Alpha== Beta ==Gamma== Delta');
  expect(body).not.toContain('❄');
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
});

it.each([
  [{ from: 0, to: 2, originalText: 'AB' }, { from: 2, to: 5, originalText: 'CDE' }],
  [{ from: 0, to: 3, originalText: 'ABC' }, { from: 2, to: 5, originalText: 'CDE' }],
  [{ from: 2, to: 5, originalText: 'CDE' }, { from: 0, to: 2, originalText: 'AB' }]
])('preserves touching, overlapping and out-of-order saved ranges: %j', async (first, second) => {
  save('manual', 'ABCDE', null, { kind: 'topic', reveal: null });
  saveHighlight([first, second], 'Shared annotation.');
  const body = await expectAllPaths();
  expect(body.replaceAll('==', '').replace(' (❄ highlight: Shared annotation.)', '')).toContain('ABCDE');
  expect(body.match(/==/g)).toHaveLength(4);
  expect(body.match(/Shared annotation\./g)).toHaveLength(1);
});

it('reads only related documents and rejects a render when saved ranges and notes change during generation', async () => {
  save('manual', 'Alpha Beta Gamma Delta', null, { kind: 'topic', reveal: null });
  saveHighlight();
  save('unrelated', 'Unrelated body.', null, { kind: 'topic', reveal: null });
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    saveHighlight([ranges[0]!, { from: 17, to: 22, originalText: 'Delta' }], 'Current note.');
    return render(...input);
  });
  await syncFrom('highlight');
  const body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('==Alpha==');
  expect(body).toContain('==Delta==');
  expect(body).not.toContain('==Gamma==');
  expect(body.match(/Current note\./g)).toHaveLength(1);
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'highlight']));
  const file = mirror('manual');
  const before = (await fs.stat(file)).mtimeMs;
  await syncFrom('highlight');
  expect((await fs.stat(file)).mtimeMs).toBe(before);
});
