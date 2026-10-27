// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
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

import { persistCreatedNodeImageAttachment } from '../attachments/persistCreatedNodeImageAttachment.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { resolveMirrorAttachmentPath } from './attachmentPathReference.js';
import { exportCurrentArticleMirror } from './exportCurrentArticleMirror.js';
import { resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let owner = '';
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
  expect(ids).toHaveLength(1);
  return syncIncrementalMirrorOutput(ids);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-image-cloze-'));
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

async function seedImage() {
  owner = 'image-owner';
  save(owner, '', null, { kind: 'topic', reveal: null });
  await persistCreatedNodeImageAttachment({ bytes: sourcePng, expectedHash: sourceHash, mimeType: 'image/png',
    nodeId: owner, originalName: 'original.png', persistNode: () =>
      save(owner, `![Original image](asset://${sourceHash}.png)`, null, { kind: 'topic', reveal: null }) });
  save('unrelated', 'Unrelated body.', null, { kind: 'topic', reveal: null });
}
function annotation(content: string) {
  save('excerpt', content, owner, { kind: 'item', reveal: `![Original image](asset://${sourceHash}.png)\nSaved diagram answer.`,
    anchorLink: { id: 'excerpt', kind: 'cloze', locator: { attachmentId: sourceHash, x: 0.1, y: 0.2, width: 0.5, height: 0.1 } },
    imageRegions: [{ attachmentId: sourceHash, regions: [{ id: 'region', x: 0.1, y: 0.2, width: 0.5, height: 0.1 }] }] });
}
function once(body: string, facts: string[]) {
  for (const fact of facts) expect(body.split(fact), `${fact}: ${body}`).toHaveLength(2);
}
async function allPaths(id: string) {
  expect(resolveArticleIdsFromNodeId(id)).toEqual([owner]);
  await syncFrom(id);
  const body = await fs.readFile(mirror(owner), 'utf8');
  await exportCurrentArticleMirror(id, null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(body);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror(owner), 'utf8')).resolves.toBe(body);
  expect([...loadMirrorArticleRecords().keys()].sort()).toEqual([owner, 'unrelated'].sort());
  return body;
}

const sourcePng = readFileSync(path.resolve('assets/brand/foliole-leaf-tight.png'));
const sourceHash = createHash('sha256').update(sourcePng).digest('hex');
const image = `![Original image](asset://${sourceHash}.png)`;
async function excerpt(note = '') {
  annotation(`Saved diagram prompt.\n${image}${note}`);
}

it('retains image cloze prompt, original image and answer through all entrypoints', async () => {
  await seedImage();
  await excerpt('\nSaved diagram note.');
  const resourceBefore = await fs.stat(resolveMirrorAttachmentPath(`${sourceHash}.png`)!);
  const body = await allPaths('excerpt');
  once(body, ['Saved diagram prompt.', 'Saved diagram note.', 'Saved diagram answer.']);
  const resource = resolveMirrorAttachmentPath(`${sourceHash}.png`)!;
  expect(path.isAbsolute(resource)).toBe(true);
  expect(body).toContain(`![Original image](${resource})`);
  expect(await fs.readFile(resource)).toEqual(sourcePng);
  expect((await fs.stat(resource)).mtimeMs).toBe(resourceBefore.mtimeMs);
  expect(body).not.toContain('asset://');
  expect(body).not.toContain('PDF page');
  expect(body).not.toContain('<u>');
  expect(await fs.readdir(path.dirname(mirror(owner)))).not.toContain('Assets');
});

it('retains saved image and edited text after parent image removal, including nested text clozes', async () => {
  await seedImage();
  await excerpt('\nDiagram source note.');
  save('nested', 'Nested diagram thought.', 'excerpt', { kind: 'topic', reveal: null,
    anchorLink: { id: 'nested', kind: 'highlight', locator: { from: 0, to: 5, originalText: 'Saved' } } });
  save('cloze', 'Diagram prompt [...]', 'nested', { reveal: 'Diagram answer.',
    anchorLink: { id: 'cloze', kind: 'cloze', locator: { from: 0, to: 6, originalText: 'Nested' } } });
  save(owner, 'Original image removed from body.', null, { kind: 'topic', reveal: null });
  const body = await allPaths('cloze');
  once(body, ['diagram thought.', 'Diagram prompt', 'Diagram answer.', 'source note.', 'Saved diagram answer.']);
  expect(body).toContain(`![Original image](${resolveMirrorAttachmentPath(`${sourceHash}.png`)!})`);
});

it('rechecks concurrent image cloze notes and reads only its owner while leaving unrelated output and unchanged bytes alone', async () => {
  await seedImage();
  await excerpt('\n※ Old diagram note.');
  await rebuildAllMirrorOutput();
  const file = mirror('unrelated');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    annotation(image + '\n※ Current diagram note.');
    return render(...input);
  });
  await syncFrom('excerpt');
  const body = await fs.readFile(mirror(owner), 'utf8');
  once(body, ['Current diagram note.', 'Saved diagram answer.']);
  expect(body).not.toContain('Old diagram note.');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set([owner, 'excerpt']));
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
  const mtime = (await fs.stat(mirror(owner))).mtimeMs;
  await syncFrom('excerpt');
  expect((await fs.stat(mirror(owner))).mtimeMs).toBe(mtime);
});

it('removes, restores and permanently deletes the image cloze expression without touching a same-title owner', async () => {
  await seedImage();
  await excerpt('\n※ Diagram lifecycle note.');
  save('collision', 'Collision body.', null, { kind: 'topic', title: 'image-owner', reveal: null });
  await rebuildAllMirrorOutput();
  const file = mirror('collision');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  once(await fs.readFile(mirror(owner), 'utf8'), ['Diagram lifecycle note.']);
  softDeleteNodes({ nodeIds: ['excerpt'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom(owner);
  expect(await fs.readFile(mirror(owner), 'utf8')).not.toContain('Diagram lifecycle note.');
  restoreNodes({ nodeIds: ['excerpt'] });
  await syncFrom('excerpt');
  once(await fs.readFile(mirror(owner), 'utf8'), ['Diagram lifecycle note.']);
  softDeleteNodes({ nodeIds: ['excerpt'], deletedAt: '2030-10-06T00:01:00.000Z' });
  deleteNodesPermanently({ nodeIds: ['excerpt'], nodeOrder: [] });
  await syncFrom(owner);
  expect(await fs.readFile(mirror(owner), 'utf8')).not.toContain('Diagram lifecycle note.');
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
});

it('includes a generic image cloze nested under an existing PDF screenshot without losing either text layer', async () => {
  await seedImage();
  save(owner, 'PDF source metadata.', null, { kind: 'topic', reveal: null });
  save('pdf-crop', image + '\nPDF screenshot note.', owner, { kind: 'topic', reveal: null,
    anchorLink: { id: 'pdf-crop', kind: 'image-excerpt', locator: { page: 2, x: 0.1, y: 0.2 } } });
  save('excerpt', image + '\nScreenshot cloze prompt.', 'pdf-crop', { reveal: image + '\nScreenshot cloze answer.',
    anchorLink: { id: 'excerpt', kind: 'cloze', locator: { attachmentId: sourceHash, x: 0.1, y: 0.2, width: 0.5, height: 0.1 } } });
  const body = await allPaths('excerpt');
  once(body, ['PDF page: 2', 'PDF screenshot note.', 'Screenshot cloze prompt.', 'Screenshot cloze answer.']);
  expect(body).toContain(`![Original image](${resolveMirrorAttachmentPath(`${sourceHash}.png`)!})`);
  expect(await fs.readFile(resolveMirrorAttachmentPath(`${sourceHash}.png`)!)).toEqual(sourcePng);
});
