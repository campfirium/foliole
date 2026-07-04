// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-sync-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-sync-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';
import { backfillMissingMirrorOutput, rebuildMirrorOutput, syncIncrementalMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveNode(nodeId: string, parentNodeId: string | null, content: string, updatedAt: string, extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  const reveal = extra.reveal ?? null;
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind: extra.kind ?? (extra.anchorLink?.kind === 'cloze' || reveal !== null ? 'item' : 'topic'),
    title: extra.title ?? nodeId,
    isTitleManual: true,
    hideTitleHeading: false,
    content,
    reveal,
    anchorLink: extra.anchorLink ?? null,
    position: extra.position ?? 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt,
    ...extra
  });
}

function seedArticles() {
  const content = 'Keep bright text here.\n\nStudy answer today.';
  const highlightText = 'bright text';
  const clozeText = 'answer';
  saveNode('node-article', null, content, '2026-03-30T00:00:00.000Z', { title: 'Mirror Demo' });
  saveNode('node-highlight', 'node-article', 'bright text', '2026-03-30T00:00:00.000Z', { anchorLink: { id: '1', kind: 'highlight', locator: { from: content.indexOf(highlightText), to: content.indexOf(highlightText) + highlightText.length, originalText: highlightText } }, position: 1 });
  saveNode('node-cloze', 'node-article', 'Keep bright text here.\n\nStudy [...] today.', '2026-03-30T00:00:00.000Z', { anchorLink: { id: '2', kind: 'cloze', locator: { from: content.indexOf(clozeText), to: content.indexOf(clozeText) + clozeText.length, originalText: clozeText } }, position: 2, reveal: 'answer' });
  saveNode('node-second', null, 'Plain body.', '2026-03-30T00:00:00.000Z', { title: 'Second Demo', position: 3 });
}

function mirrorPath(fileName: string) {
  return path.join(tempRoot, 'Library', 'Mirror', fileName);
}

async function readMirror(fileName: string) {
  return fs.readFile(mirrorPath(fileName), 'utf8');
}

it('updates the same article mirror when article body changes and removes legacy mirror artifacts', async () => {
  seedArticles();
  await rebuildMirrorOutput();
  await fs.writeFile(mirrorPath('Highlights.md'), 'old', 'utf8');
  await fs.writeFile(mirrorPath('Clozes.md'), 'old', 'utf8');
  await fs.mkdir(path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo'), { recursive: true });

  const updatedContent = 'Keep bright text here.\n\nUpdated body keeps answer.';
  saveNode('node-article', null, updatedContent, '2030-03-30T00:10:00.000Z', { title: 'Mirror Demo' });
  saveNode('node-highlight', 'node-article', 'bright text', '2030-03-30T00:10:00.000Z', {
    anchorLink: { id: '1', kind: 'highlight', locator: { from: updatedContent.indexOf('bright text'), to: updatedContent.indexOf('bright text') + 'bright text'.length, originalText: 'bright text' } },
    position: 1
  });
  saveNode('node-cloze', 'node-article', 'Keep bright text here.\n\nUpdated body keeps [...] .', '2030-03-30T00:10:00.000Z', {
    anchorLink: { id: '2', kind: 'cloze', locator: { from: updatedContent.indexOf('answer'), to: updatedContent.indexOf('answer') + 'answer'.length, originalText: 'answer' } },
    position: 2,
    reveal: 'answer'
  });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Updated body keeps <u>answer</u>.');
  await expect(fs.access(mirrorPath('Highlights.md'))).rejects.toThrow();
  await expect(fs.access(mirrorPath('Clozes.md'))).rejects.toThrow();
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo'))).rejects.toThrow();
});

it('updates the same article mirror when highlight content changes', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-highlight', 'node-article', 'gold text', '2030-03-30T00:11:00.000Z', {
    anchorLink: { id: '1', kind: 'highlight', locator: { from: 'Keep bright text here.\n\nStudy answer today.'.indexOf('bright text'), to: 'Keep bright text here.\n\nStudy answer today.'.indexOf('bright text') + 'bright text'.length, originalText: 'bright text' } },
    position: 1
  });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('==bright text== (❄ highlight: gold text)');
});

it('updates the same article mirror when cloze content changes', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-cloze', 'node-article', 'Keep bright text here.\n\nCustom prompt [...] today.', '2030-03-30T00:12:00.000Z', {
    anchorLink: { id: '2', kind: 'cloze', locator: { from: 'Keep bright text here.\n\nStudy answer today.'.indexOf('answer'), to: 'Keep bright text here.\n\nStudy answer today.'.indexOf('answer') + 'answer'.length, originalText: 'answer' } },
    position: 2,
    reveal: 'final answer'
  });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Study <u>answer</u>');
  await expect(readMirror('Mirror Demo.md')).resolves.toContain(
    'cloze: Keep bright text here.\n\nCustom prompt [...] today.; answer: final answer'
  );
});

it('updates the parent article mirror when a manual child topic changes', async () => {
  saveNode('node-article', null, 'Parent body.', '2026-03-30T00:00:00.000Z', { title: 'Mirror Demo' });
  saveNode('node-child-topic', 'node-article', 'First child body.', '2026-03-30T00:00:00.000Z', {
    kind: 'topic',
    title: 'Key Point',
    position: 1
  });
  await rebuildMirrorOutput();

  saveNode('node-child-topic', 'node-article', 'Updated child body.', '2030-03-30T00:17:00.000Z', {
    kind: 'topic',
    title: 'Key Point',
    position: 1
  });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('(❄ keyword: Key Point; note: Updated child body.)');
});

it('startup backfill only recreates missing article files without refreshing existing stale ones', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-article', null, 'Keep bright text here.\n\nShould stay stale on startup.', '2030-03-30T00:13:00.000Z', { title: 'Mirror Demo' });
  await fs.rm(mirrorPath('Second Demo.md'));

  await expect(backfillMissingMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.not.toContain('Should stay stale on startup.');
  await expect(readMirror('Second Demo.md')).resolves.toContain('Plain body.');
});

it('manual rebuild fully refreshes all article mirrors', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  const rebuiltContent = 'Keep bright text here.\n\nManual rebuild refresh answer.';
  saveNode('node-article', null, rebuiltContent, '2030-03-30T00:14:00.000Z', { title: 'Mirror Demo' });
  saveNode('node-highlight', 'node-article', 'bright text', '2030-03-30T00:14:00.000Z', {
    anchorLink: { id: '1', kind: 'highlight', locator: { from: rebuiltContent.indexOf('bright text'), to: rebuiltContent.indexOf('bright text') + 'bright text'.length, originalText: 'bright text' } },
    position: 1
  });
  saveNode('node-cloze', 'node-article', 'Keep bright text here.\n\nManual rebuild refresh [...].', '2030-03-30T00:14:00.000Z', {
    anchorLink: { id: '2', kind: 'cloze', locator: { from: rebuiltContent.indexOf('answer'), to: rebuiltContent.indexOf('answer') + 'answer'.length, originalText: 'answer' } },
    position: 2,
    reveal: 'answer'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 2, queued_article_count: 2 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Manual rebuild refresh <u>answer</u>.');
  await expect(readMirror('Second Demo.md')).resolves.toContain('Plain body.');
});

it('manual rebuild clears mirror contents without removing the mirror root directory itself', async () => {
  seedArticles();
  const rootPath = path.join(tempRoot, 'Library', 'Mirror');
  const removeSpy = vi.spyOn(fs, 'rm');

  await rebuildMirrorOutput();
  saveNode('node-article', null, 'Manual rebuild root stays.', '2030-03-30T00:16:00.000Z', { title: 'Mirror Demo' });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 2, queued_article_count: 2 });
  expect(removeSpy.mock.calls.some(([targetPath]) => targetPath === rootPath)).toBe(false);
});

it('moves article mirrors when the parent folder path changes', async () => {
  saveNode('folder-root', null, '', '2026-03-30T00:00:00.000Z', { kind: 'folder', title: 'Projects' });
  saveNode('folder-child', 'folder-root', '', '2026-03-30T00:00:00.000Z', { kind: 'folder', title: 'Research', position: 1 });
  saveNode('node-article', 'folder-child', 'Nested body.', '2026-03-30T00:00:00.000Z', { kind: 'topic', title: 'Mirror Demo', position: 2 });

  await rebuildMirrorOutput();
  await expect(fs.readFile(mirrorPath(path.join('Projects', 'Research', 'Mirror Demo.md')), 'utf8')).resolves.toContain('Nested body.');

  saveNode('folder-child', 'folder-root', '', '2030-03-30T00:15:00.000Z', { kind: 'folder', title: 'Archive', position: 1 });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(fs.readFile(mirrorPath(path.join('Projects', 'Archive', 'Mirror Demo.md')), 'utf8')).resolves.toContain('Nested body.');
  await expect(fs.access(mirrorPath(path.join('Projects', 'Research', 'Mirror Demo.md')))).rejects.toThrow();
});

it('prunes stale mirror output that is no longer in the current target set', async () => {
  seedArticles();
  await rebuildMirrorOutput();
  await fs.mkdir(mirrorPath(path.join('Old Folder', 'Nested')), { recursive: true });
  await fs.writeFile(mirrorPath(path.join('Old Folder', 'Nested', 'stale.md')), 'stale', 'utf8');
  await fs.writeFile(mirrorPath('stale-root.md'), 'stale', 'utf8');

  saveNode('node-second', null, 'Plain body updated.', '2030-03-30T00:18:00.000Z', { title: 'Second Demo', position: 3 });

  await expect(syncIncrementalMirrorOutput(['node-second'])).resolves.toMatchObject({ rebuilt_article_count: 1 });
  await expect(fs.access(mirrorPath(path.join('Old Folder')))).rejects.toThrow();
  await expect(fs.access(mirrorPath('stale-root.md'))).rejects.toThrow();
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Keep ==bright text== here.');
  await expect(readMirror('Second Demo.md')).resolves.toContain('Plain body updated.');
});

it('appends manual child topics to the parent article mirror instead of exporting extra files', async () => {
  saveNode('folder-root', null, '', '2026-03-30T00:00:00.000Z', { kind: 'folder', title: 'test' });
  saveNode('node-parent-topic', 'folder-root', 'Parent body.', '2026-03-30T00:00:00.000Z', {
    kind: 'topic',
    title: 'Parent Topic',
    position: 1
  });
  saveNode('node-child-topic', 'node-parent-topic', 'Child body.', '2026-03-30T00:00:00.000Z', {
    kind: 'topic',
    title: 'Key Point',
    position: 2
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror(path.join('test', 'Parent Topic.md'))).resolves.toContain('(❄ keyword: Key Point; note: Child body.)');
  await expect(fs.access(mirrorPath(path.join('test', 'Key Point.md')))).rejects.toThrow();
});
