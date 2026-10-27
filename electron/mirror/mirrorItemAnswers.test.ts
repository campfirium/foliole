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
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

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

it.each([
  { question: '', answer: 'Answer without a question.' },
  { question: 'Question without an answer.', answer: null },
  { question: '', answer: null },
  { question: 'Whitespace answer.', answer: '  \n ' },
  { question: 'Same fact.', answer: 'Same fact.' },
  { question: '# manual\n\nSaved question.', answer: 'Paragraph one.\n\nParagraph two.\n\n- first\n- second' }
])('preserves saved question and answer facts through all paths: $question', async ({ question, answer }) => {
  save('manual', question, null, { reveal: answer });
  await syncFrom('manual');
  const automatic = await fs.readFile(mirror('manual'), 'utf8');
  if (question) expect(automatic).toContain(question);
  if (answer?.trim()) {
    expect(automatic).toContain(`## Answer\n\n${answer}`);
    expect(automatic.match(/## Answer/g)).toHaveLength(1);
  } else {
    expect(automatic).not.toContain('## Answer');
    expect(automatic).not.toContain('null');
  }
  await exportCurrentArticleMirror('manual', null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toBe(automatic);
});

it('updates and clears only the saved answer without rewriting unrelated files', async () => {
  save('manual', 'Question body.');
  save('unrelated', 'Unrelated question.', null, { reveal: 'Unrelated answer.' });
  await rebuildAllMirrorOutput();
  const unrelated = mirror('unrelated');
  const before = { body: await fs.readFile(unrelated, 'utf8'), mtime: (await fs.stat(unrelated)).mtimeMs };
  save('manual', 'Question body.', null, { reveal: 'Changed answer.' });
  await syncFrom('manual');
  let body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('Changed answer.');
  expect(body).not.toContain('Saved answer fact.');
  save('manual', 'Question body.', null, { reveal: null });
  await syncFrom('manual');
  body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('Question body.');
  expect(body).not.toContain('Changed answer.');
  expect(body).not.toContain('## Answer');
  expect(await fs.readFile(unrelated, 'utf8')).toBe(before.body);
  expect((await fs.stat(unrelated)).mtimeMs).toBe(before.mtime);
});

it('keeps the native answer separate from a direct derived cloze answer without duplicating either', async () => {
  save('manual', 'Question body.', null, { reveal: 'Native answer.' });
  save('cloze', '[...] body.', 'manual', { reveal: 'Derived answer.', anchorLink: {
    id: 'cloze', kind: 'cloze', locator: { from: 0, to: 8, originalText: 'Question' }
  } });
  await syncFrom('manual');
  const automatic = await fs.readFile(mirror('manual'), 'utf8');
  expect(automatic).toContain('<u>Question</u>');
  expect(automatic.match(/Native answer\./g)).toHaveLength(1);
  expect(automatic.match(/Derived answer\./g)).toHaveLength(1);
  await exportCurrentArticleMirror('manual', null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toBe(automatic);
  softDeleteNodes({ nodeIds: ['cloze'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('manual');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.not.toContain('Derived answer.');
  restoreNodes({ nodeIds: ['cloze'] });
  await syncFrom('manual');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toBe(automatic);
});
