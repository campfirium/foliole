// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { loadRenderer } from './rendererLoader.js';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const tempRoot of tempRoots.splice(0)) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function restoreRendererUrl(originalUrl: string | undefined) {
  if (originalUrl === undefined) {
    delete process.env.ELECTRON_RENDERER_URL;
  } else {
    process.env.ELECTRON_RENDERER_URL = originalUrl;
  }
}

it('loads startup errors from a local surface independent of the dev server', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  const window = {
    loadURL: vi.fn().mockResolvedValue(undefined)
  };

  try {
    await loadRenderer(window as never, '/runtime', {
      errorSummary: 'migration failed',
      kind: 'startup-error',
      logPath: '/logs',
      moduleLabel: 'Database migration'
    });

    const loadedUrl = new URL(window.loadURL.mock.calls[0]?.[0]);
    expect(loadedUrl.protocol).toBe('data:');
    const decodedHtml = decodeURIComponent(loadedUrl.pathname);
    expect(decodedHtml).toContain('Database migration');
    expect(decodedHtml).toContain('migration failed');
    expect(decodedHtml).toContain('/logs');
    expect(decodedHtml).toContain('__FOLIOLE_APP_READY_REPORTED__ = true');
  } finally {
    restoreRendererUrl(originalUrl);
  }
});

it('loads the Vite dev renderer directly without a prebuilt startup html', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';
  const window = {
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadURL: vi.fn().mockResolvedValue(undefined)
  };

  try {
    await loadRenderer(window as never, '/runtime');

    expect(window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:24600/');
    expect(window.loadFile).not.toHaveBeenCalled();
  } finally {
    restoreRendererUrl(originalUrl);
  }
});

it('ignores stale runtime renderer html in packaged startup', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const packagedIndexPath = path.join(tempRoot, 'dist', 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  await fs.mkdir(path.dirname(packagedIndexPath), { recursive: true });
  await fs.mkdir(runtimeHtmlDir, { recursive: true });
  await fs.writeFile(packagedIndexPath, '<html><body>packaged</body></html>', 'utf8');
  await fs.writeFile(
    path.join(runtimeHtmlDir, 'runtime-renderer-index.html'),
    '<html><head><base href="http://127.0.0.1:24600/"></head><body>stale dev shell</body></html>',
    'utf8'
  );
  const window = { loadFile: vi.fn().mockResolvedValue(undefined) };

  await loadRenderer(window as never, runtimeDir);

  expect(window.loadFile).toHaveBeenCalledWith(packagedIndexPath);
});
