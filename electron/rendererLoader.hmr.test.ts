// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({ appPath: process.cwd(), userDataPath: '/tmp' }));
const originalHmr = process.env.FOLIOLE_VITE_HMR;
const originalUrl = process.env.ELECTRON_RENDERER_URL;
let tempRoot: string | null = null;

vi.mock('electron', () => ({
  app: {
    getAppPath: () => runtimeMocks.appPath,
    getPath: () => runtimeMocks.userDataPath
  }
}));
import { loadRenderer } from './rendererLoader.js';

afterEach(async () => {
  if (originalHmr === undefined) delete process.env.FOLIOLE_VITE_HMR;
  else process.env.FOLIOLE_VITE_HMR = originalHmr;
  if (originalUrl === undefined) delete process.env.ELECTRON_RENDERER_URL;
  else process.env.ELECTRON_RENDERER_URL = originalUrl;
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
});

it('loads the Vite page directly when daily debug HMR is enabled', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-hmr-'));
  runtimeMocks.appPath = tempRoot;
  runtimeMocks.userDataPath = tempRoot;
  await fs.writeFile(path.join(tempRoot, 'runtime-renderer-index.html'), '<html></html>', 'utf8');
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';
  process.env.FOLIOLE_VITE_HMR = '1';
  const window = {
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadURL: vi.fn().mockResolvedValue(undefined)
  };

  await loadRenderer(window as never, '/runtime');

  expect(window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:24600/');
  expect(window.loadFile).not.toHaveBeenCalled();
});
