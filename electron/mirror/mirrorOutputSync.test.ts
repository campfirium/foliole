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

import { backfillMissingMirrorOutput, rebuildMirrorOutput, syncIncrementalMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
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
  saveNode('node-article', null, 'Keep <highlight id="1">bright text</highlight id="1"> here.\n\nStudy <cloze id="2">answer</cloze id="2"> today.', '2026-03-30T00:00:00.000Z', { title: 'Mirror Demo' });
  saveNode('node-highlight', 'node-article', 'bright text', '2026-03-30T00:00:00.000Z', { anchorLink: { id: '1', kind: 'highlight' }, position: 1 });
  saveNode('node-cloze', 'node-article', 'Keep bright text here.\n\nStudy [...] today.', '2026-03-30T00:00:00.000Z', { anchorLink: { id: '2', kind: 'cloze' }, position: 2, reveal: 'answer' });
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

  saveNode('node-article', null, 'Keep <highlight id="1">bright text</highlight id="1"> here.\n\nUpdated body.', '2030-03-30T00:10:00.000Z', { title: 'Mirror Demo' });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Updated body.');
  await expect(fs.access(mirrorPath('Highlights.md'))).rejects.toThrow();
  await expect(fs.access(mirrorPath('Clozes.md'))).rejects.toThrow();
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Mirror Demo'))).rejects.toThrow();
});

it('updates the same article mirror when highlight content changes', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-highlight', 'node-article', 'gold text', '2030-03-30T00:11:00.000Z', {
    anchorLink: { id: '1', kind: 'highlight' },
    position: 1
  });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('==bright text== (❄ gold text)');
});

it('updates the same article mirror when cloze content changes', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-cloze', 'node-article', 'Keep bright text here.\n\nCustom prompt [...] today.', '2030-03-30T00:12:00.000Z', {
    anchorLink: { id: '2', kind: 'cloze' },
    position: 2,
    reveal: 'final answer'
  });

  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Study _answer_');
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Custom prompt [...] today.; answer: final answer');
});

it('startup backfill only recreates missing article files without refreshing existing stale ones', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-article', null, 'Keep <highlight id="1">bright text</highlight id="1"> here.\n\nShould stay stale on startup.', '2030-03-30T00:13:00.000Z', { title: 'Mirror Demo' });
  await fs.rm(mirrorPath('Second Demo.md'));

  await expect(backfillMissingMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 1, queued_article_count: 1 });
  await expect(readMirror('Mirror Demo.md')).resolves.not.toContain('Should stay stale on startup.');
  await expect(readMirror('Second Demo.md')).resolves.toContain('Plain body.');
});

it('manual rebuild fully refreshes all article mirrors', async () => {
  seedArticles();
  await rebuildMirrorOutput();

  saveNode('node-article', null, 'Keep <highlight id="1">bright text</highlight id="1"> here.\n\nManual rebuild refresh.', '2030-03-30T00:14:00.000Z', { title: 'Mirror Demo' });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 2, queued_article_count: 2 });
  await expect(readMirror('Mirror Demo.md')).resolves.toContain('Manual rebuild refresh.');
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

it('keeps child topics under the nearest folder ancestor instead of leaking them to mirror root', async () => {
  saveNode('folder-root', null, '', '2026-03-30T00:00:00.000Z', { kind: 'folder', title: 'test' });
  saveNode('node-parent-topic', 'folder-root', 'Parent body.', '2026-03-30T00:00:00.000Z', {
    kind: 'topic',
    title: 'Parent Topic',
    position: 1
  });
  saveNode('node-child-topic', 'node-parent-topic', 'Child body.', '2026-03-30T00:00:00.000Z', {
    kind: 'topic',
    title: 'Untitled',
    position: 2
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 2, queued_article_count: 2 });
  await expect(readMirror(path.join('test', 'Untitled.md'))).resolves.toContain('Child body.');
  await expect(fs.access(mirrorPath('Untitled.md'))).rejects.toThrow();
});
