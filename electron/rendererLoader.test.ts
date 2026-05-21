// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  userDataPath: '/tmp'
}));

vi.mock('electron', () => ({
  app: {
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
  runtimeMocks.userDataPath = '/tmp';
  for (const tempRoot of tempRoots.splice(0)) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('loads startup errors from a local surface independent of the dev server', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  const window = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    loadURL: vi.fn().mockResolvedValue(undefined),
    once: vi.fn((_event: string, callback: () => void) => callback()),
    show: vi.fn()
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
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});

it('injects startup tokens and an absolute Vite module entry into dev renderer html', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body><script type="module" src="/src/main.tsx"></script></body></html>';

  const result = injectDevRendererIntoHtml(html, 'http://127.0.0.1:24600/', '--startup-document-bg:#1f211f;', 'dark');

  expect(result).toContain('<base href="http://127.0.0.1:24600/">');
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).toContain('data-resolved-base-color="dark"');
  expect(result).toContain('src="http://127.0.0.1:24600/src/main.tsx"');
  expect(result).toContain('__vite_plugin_react_preamble_installed__ = true');
  expect(result).toContain('/@react-refresh');
  expect(result).not.toContain('startupCss=');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
  expect(result).not.toContain('/*STARTUP_INJECTED_BOOT_SCRIPT*/');
});

it('injects startup tokens and a file base tag into packaged renderer html', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body></body></html>';

  const result = injectStartupTokensIntoRendererHtml(html, '/app/dist/index.html', '--startup-document-bg:#1f211f;', 'dark');

  expect(result).toMatch(/<base href="file:\/\/\/(?:[A-Z]:\/)?app\/dist\/">/);
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).toContain('data-resolved-base-color="dark"');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
  expect(result).not.toContain('/*STARTUP_INJECTED_BOOT_SCRIPT*/');
});

it('loads the prebuilt dev renderer html without regenerating it on startup', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  runtimeMocks.userDataPath = runtimeHtmlDir;
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(
    indexPath,
    '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style><script>/*STARTUP_INJECTED_BOOT_SCRIPT*/</script></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
    'utf8'
  );
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';

  try {
    expect(writePrebuiltRendererHtmlForSettings(
      runtimeDir,
      { 'foliole-base-color': 'dark' },
      'http://127.0.0.1:24600/',
      runtimeHtmlDir
    )).toBe(true);
    const prebuiltHtml = await fs.readFile(runtimeIndexPath, 'utf8');
    const window = { loadFile: vi.fn().mockResolvedValue(undefined) };

    await loadRenderer(window as never, runtimeDir);

    expect(window.loadFile).toHaveBeenCalledWith(runtimeIndexPath);
    expect(await fs.readFile(runtimeIndexPath, 'utf8')).toBe(prebuiltHtml);
    expect(prebuiltHtml).toContain('data-resolved-base-color="dark"');
    expect(prebuiltHtml).toContain('__vite_plugin_react_preamble_installed__ = true');
    expect(prebuiltHtml).toContain('type="module" src="http://127.0.0.1:24600/src/main.tsx"');
    expect(prebuiltHtml).not.toContain('foliole-runtime-renderer');
    expect(prebuiltHtml).not.toContain('STARTUP_INJECTED_BOOT_SCRIPT');
  } finally {
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});

it('keeps dev startup on the single prebuilt renderer html when it exists', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  runtimeMocks.userDataPath = runtimeHtmlDir;
  await fs.mkdir(runtimeHtmlDir, { recursive: true });
  await fs.writeFile(path.join(runtimeHtmlDir, 'runtime-renderer-index.html'), '<html><body>stale</body></html>', 'utf8');
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';
  const window = {
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadURL: vi.fn().mockResolvedValue(undefined)
  };

  try {
    await loadRenderer(window as never, runtimeDir);

    expect(window.loadFile).toHaveBeenCalledWith(path.join(runtimeHtmlDir, 'runtime-renderer-index.html'));
    expect(window.loadURL).not.toHaveBeenCalled();
  } finally {
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});

it('overwrites the single prebuilt html when settings change', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  runtimeMocks.userDataPath = runtimeHtmlDir;
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(
    indexPath,
    '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style><script>/*STARTUP_INJECTED_BOOT_SCRIPT*/</script></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
    'utf8'
  );
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';

  try {
    expect(writePrebuiltRendererHtmlForSettings(runtimeDir, { 'foliole-base-color': 'light' }, process.env.ELECTRON_RENDERER_URL, runtimeHtmlDir)).toBe(true);
    const firstHtml = await fs.readFile(runtimeIndexPath, 'utf8');
    expect(firstHtml).toContain('data-resolved-base-color="light"');

    expect(writePrebuiltRendererHtmlForSettings(runtimeDir, { 'foliole-base-color': 'dark' }, process.env.ELECTRON_RENDERER_URL, runtimeHtmlDir)).toBe(true);

    const overwrittenHtml = await fs.readFile(runtimeIndexPath, 'utf8');
    expect(overwrittenHtml).not.toBe(firstHtml);
    expect(overwrittenHtml).toContain('data-resolved-base-color="dark"');
    expect(overwrittenHtml).toContain('--startup-document-bg: #1f211f;');
  } finally {
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});

it('keeps startup skeleton variables isolated from workspace css defaults', async () => {
  const originalUrl = process.env.ELECTRON_RENDERER_URL;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-loader-'));
  tempRoots.push(tempRoot);
  const runtimeDir = path.join(tempRoot, 'electron-dist', 'electron');
  const indexPath = path.join(tempRoot, 'index.html');
  const runtimeHtmlDir = path.join(tempRoot, 'userData');
  const runtimeIndexPath = path.join(runtimeHtmlDir, 'runtime-renderer-index.html');
  runtimeMocks.userDataPath = runtimeHtmlDir;
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.copyFile(path.join(process.cwd(), 'index.html'), indexPath);
  process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:24600/';

  try {
    expect(writePrebuiltRendererHtmlForSettings(
      runtimeDir,
      { 'foliole-base-color': 'dark' },
      process.env.ELECTRON_RENDERER_URL,
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
  } finally {
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});
