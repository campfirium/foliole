// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  userDataPath: '/tmp'
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => runtimeMocks.userDataPath
  }
}));

import { loadRenderer } from './rendererLoader.js';
import { RUNTIME_RENDERER_INDEX_CACHE_MARKER } from './runtimeRendererHtml.js';

const tempRoots: string[] = [];

afterEach(async () => {
  runtimeMocks.userDataPath = '/tmp';
  for (const tempRoot of tempRoots.splice(0)) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

async function createPackagedRuntimeHarness() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const packagedIndexPath = path.join(tempRoot, 'dist', 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  runtimeMocks.userDataPath = runtimeHtmlDir;
  await fs.mkdir(path.dirname(packagedIndexPath), { recursive: true });
  await fs.mkdir(runtimeHtmlDir, { recursive: true });
  await fs.writeFile(packagedIndexPath, '<html><body>packaged</body></html>', 'utf8');
  return { packagedIndexPath, runtimeDir, runtimeIndexPath };
}

it('falls back to packaged startup html when prebuilt startup html references stale assets', async () => {
  const { packagedIndexPath, runtimeDir, runtimeIndexPath } = await createPackagedRuntimeHarness();
  await fs.writeFile(runtimeIndexPath, createRuntimeHtml(packagedIndexPath, 'index-stale.js'), 'utf8');
  const window = { loadFile: vi.fn().mockResolvedValue(undefined) };

  await loadRenderer(window as never, runtimeDir);

  expect(window.loadFile).toHaveBeenCalledWith(packagedIndexPath);
});

function createRuntimeHtml(packagedIndexPath: string, scriptAssetName: string, styleAssetName = 'index-stale.css', marker = '') {
  const baseHref = pathToFileURL(`${path.dirname(packagedIndexPath)}${path.sep}`).href;
  return `<html><head>${marker}<base href="${baseHref}"><link rel="stylesheet" href="./assets/${styleAssetName}"></head><body><script type="module" src="./assets/${scriptAssetName}"></script></body></html>`;
}

it('falls back to packaged startup html when prebuilt startup html is a legacy unmarked cache', async () => {
  const { packagedIndexPath, runtimeDir, runtimeIndexPath } = await createPackagedRuntimeHarness();
  const packagedAssetPath = path.join(path.dirname(packagedIndexPath), 'assets', 'index-current.js');
  const packagedStylePath = path.join(path.dirname(packagedIndexPath), 'assets', 'index-current.css');
  await fs.mkdir(path.dirname(packagedAssetPath), { recursive: true });
  await fs.writeFile(packagedAssetPath, 'console.log("current");', 'utf8');
  await fs.writeFile(packagedStylePath, 'body{}', 'utf8');
  await fs.writeFile(runtimeIndexPath, createRuntimeHtml(packagedIndexPath, 'index-current.js', 'index-current.css'), 'utf8');
  const window = { loadFile: vi.fn().mockResolvedValue(undefined) };

  await loadRenderer(window as never, runtimeDir);

  expect(window.loadFile).toHaveBeenCalledWith(packagedIndexPath);
});

it('loads current prebuilt startup html in packaged mode when referenced assets exist', async () => {
  const { packagedIndexPath, runtimeDir, runtimeIndexPath } = await createPackagedRuntimeHarness();
  const packagedAssetPath = path.join(path.dirname(packagedIndexPath), 'assets', 'index-current.js');
  const packagedStylePath = path.join(path.dirname(packagedIndexPath), 'assets', 'index-current.css');
  await fs.mkdir(path.dirname(packagedAssetPath), { recursive: true });
  await fs.writeFile(packagedAssetPath, 'console.log("current");', 'utf8');
  await fs.writeFile(packagedStylePath, 'body{}', 'utf8');
  await fs.writeFile(
    runtimeIndexPath,
    createRuntimeHtml(packagedIndexPath, 'index-current.js', 'index-current.css', RUNTIME_RENDERER_INDEX_CACHE_MARKER),
    'utf8'
  );
  const window = { loadFile: vi.fn().mockResolvedValue(undefined) };

  await loadRenderer(window as never, runtimeDir);

  expect(window.loadFile).toHaveBeenCalledWith(runtimeIndexPath);
});
