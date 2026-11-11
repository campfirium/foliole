import { ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { app } from 'electron';
import { expect, it, vi } from 'vitest';

import { sendArticleToEdge } from './sendArticleToEdge.js';

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: vi.fn()
}));
vi.mock('./articleTargetSettings.js', () => ({
  resolveSelectedArticleTarget: async () => ({
    id: 'browser', name: 'Browser', executable: 'test-browser', args: []
  })
}));

it('opens the generated page from browser-reading and still expires legacy pages', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'foliole-reading-test-'));
  vi.mocked(app.getPath).mockReturnValue(temp);
  const child = new ChildProcess();
  vi.mocked(spawn).mockImplementation(() => {
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  try {
    const legacy = join(temp, 'Foliole', 'edge-read-aloud');
    const expired = join(legacy, 'article-expire');
    const fresh = join(legacy, 'article-recent');
    await mkdir(expired, { recursive: true });
    await mkdir(fresh);
    await writeFile(join(fresh, 'index.html'), 'Recently opened');
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(expired, yesterday, yesterday);

    await sendArticleToEdge({
      title: 'Reading topic', markdown: 'Article body.', leafSvg: '<svg/>',
      language: 'en', contentsLabel: 'Contents'
    });

    const opened = vi.mocked(spawn).mock.calls[0]?.[1]?.[0] as string;
    expect(dirname(dirname(opened))).toBe(join(temp, 'Foliole', 'browser-reading'));
    expect(await readFile(opened, 'utf8')).toContain('Article body.');
    expect(await readdir(legacy)).toEqual(['article-recent']);
    expect(await readFile(join(fresh, 'index.html'), 'utf8')).toBe('Recently opened');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
