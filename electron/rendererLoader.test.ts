// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({ appPath: process.cwd(), userDataPath: '/tmp' }));

vi.mock('electron', () => ({
  app: {
    getAppPath: () => runtimeMocks.appPath,
    getPath: () => runtimeMocks.userDataPath
  }
}));
import {
  injectDevRendererIntoHtml,
  injectStartupTokensIntoRendererHtml,
  loadRenderer,
  writePrebuiltRendererHtmlForSettings
} from './rendererLoader.js';

const tempRoots: string[] = [];

afterEach(async () => {
  runtimeMocks.appPath = process.cwd();
  runtimeMocks.userDataPath = '/tmp';
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

it('injects startup tokens and an absolute Vite module entry into dev renderer html without React refresh', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body><script type="module" src="/src/main.tsx"></script></body></html>';

  const result = injectDevRendererIntoHtml(html, 'http://127.0.0.1:24600/', '--startup-document-bg:#1f211f;', 'dark');

  expect(result).toContain('<base href="http://127.0.0.1:24600/">');
  expect(result).toContain('<html style="--startup-document-bg:#1f211f;"');
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).toContain('data-resolved-base-color="dark"');
  expect(result).toContain("entry.type = 'module';");
  expect(result).toContain('entry.src = "http://127.0.0.1:24600/src/main.tsx";');
  expect(result).not.toContain('__vite_plugin_react_preamble_installed__ = true');
  expect(result).not.toContain('/@react-refresh');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
});

it('injects startup tokens and a file base tag into packaged renderer html', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body></body></html>';

  const result = injectStartupTokensIntoRendererHtml(html, '/app/dist/index.html', '--startup-document-bg:#1f211f;', 'dark');

  expect(result).toMatch(/<base href="file:\/\/\/(?:[A-Z]:\/)?app\/dist\/">/);
  expect(result).toContain('<html style="--startup-document-bg:#1f211f;"');
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).toContain('data-resolved-base-color="dark"');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
});

it('replaces build-time startup theme attributes when runtime settings generate custom startup html', () => {
  const html =
    '<html data-base-color="light" data-resolved-base-color="light" style="--startup-document-bg:#ffffff;"><head><style>:root{--startup-document-bg:#ffffff;}</style></head><body></body></html>';

  const result = injectStartupTokensIntoRendererHtml(html, '/app/dist/index.html', '--startup-document-bg:#1f211f;', 'dark');

  expect(result.match(/data-base-color=/g)).toHaveLength(1);
  expect(result.match(/data-resolved-base-color=/g)).toHaveLength(1);
  expect(result).toContain('data-base-color="dark"');
  expect(result).toContain('data-resolved-base-color="dark"');
  expect(result).not.toContain('data-base-color="light"');
  expect(result).not.toContain('data-resolved-base-color="light"');
});

it('loads the prebuilt dev renderer html without waiting for Vite to render the first page', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  runtimeMocks.appPath = runtimeDir;
  runtimeMocks.userDataPath = runtimeHtmlDir;
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(
    indexPath,
    '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style><script>/*STARTUP_INJECTED_BOOT_SCRIPT*/</script></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
    'utf8'
  );
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';
  const window = {
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadURL: vi.fn().mockResolvedValue(undefined)
  };

  try {
    expect(writePrebuiltRendererHtmlForSettings(
      runtimeDir,
      { 'foliole-base-color': 'dark' },
      'http://127.0.0.1:24600/',
      runtimeHtmlDir
    )).toBe(true);
    const prebuiltHtml = await fs.readFile(runtimeIndexPath, 'utf8');

    await loadRenderer(window as never, runtimeDir);

    expect(window.loadFile).toHaveBeenCalledWith(runtimeIndexPath);
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(prebuiltHtml).toContain('data-resolved-base-color="dark"');
    expect(prebuiltHtml).toContain('entry.src = "http://127.0.0.1:24600/src/main.tsx";');
    expect(prebuiltHtml).not.toContain('STARTUP_INJECTED_BOOT_SCRIPT');
  } finally {
    restoreRendererUrl(originalUrl);
  }
});

it('falls back to the Vite dev renderer when no prebuilt startup html exists', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  runtimeMocks.appPath = tempRoot;
  runtimeMocks.userDataPath = runtimeHtmlDir;
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

it('keeps startup skeleton variables isolated from workspace css defaults', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.copyFile(path.join(process.cwd(), 'index.html'), indexPath);

  expect(writePrebuiltRendererHtmlForSettings(
    runtimeDir,
    { 'foliole-base-color': 'dark' },
    'http://127.0.0.1:24600/',
    runtimeHtmlDir
  )).toBe(true);

  const prebuiltHtml = await fs.readFile(runtimeIndexPath, 'utf8');
  const skeletonCss = prebuiltHtml.slice(
    prebuiltHtml.indexOf('.startup-shell'),
    prebuiltHtml.indexOf('@media (max-width: 1279px)')
  );

  expect(prebuiltHtml).toContain('--startup-region-main-document-bg: #1f211f;');
  expect(skeletonCss).toContain('var(--startup-region-main-document-bg)');
  expect(skeletonCss).not.toContain('var(--workspace-region-main-document-bg)');
});

it('prebuilds the startup skeleton with the persisted folder column width', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.copyFile(path.join(process.cwd(), 'index.html'), indexPath);

  expect(writePrebuiltRendererHtmlForSettings(
    runtimeDir,
    {
      'foliole-base-color': 'dark',
      'foliole-workspace-dual-list-width': '224',
      'foliole-workspace-list-width': '484'
    },
    'http://127.0.0.1:24600/',
    runtimeHtmlDir
  )).toBe(true);

  const prebuiltHtml = await fs.readFile(runtimeIndexPath, 'utf8');

  expect(prebuiltHtml).toContain('--startup-folder-column-width: 224px;');
  expect(prebuiltHtml).toContain('--workspace-folder-column-width: var(--startup-folder-column-width);');
  expect(prebuiltHtml).toContain('--workspace-list-folder-current-width: min(var(--workspace-folder-column-width), var(--workspace-list-current-width));');
  expect(prebuiltHtml).toContain('style="');
  expect(prebuiltHtml).toContain('--startup-list-width: 484px;');
});

it('resolves system base color to dark for prebuilt startup html', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.copyFile(path.join(process.cwd(), 'index.html'), indexPath);

  expect(writePrebuiltRendererHtmlForSettings(
    runtimeDir,
    { 'foliole-base-color': 'system' },
    'http://127.0.0.1:24600/',
    runtimeHtmlDir,
    'dark'
  )).toBe(true);

  const prebuiltHtml = await fs.readFile(runtimeIndexPath, 'utf8');

  expect(prebuiltHtml).toContain('data-resolved-base-color="dark"');
  expect(prebuiltHtml).toContain('--startup-region-main-document-bg: #1f211f;');
});
