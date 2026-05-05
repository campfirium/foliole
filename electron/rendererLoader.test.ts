// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('./runtimeStartupTokens.js', () => ({
  getRuntimeStartupTokensInlineCss: () => '--startup-document-bg:#1f211f;',
  getRuntimeStartupTokensThemeSource: () => 'dark'
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp'
  }
}));

import {
  activateDeferredRendererEntry,
  injectDevRendererIntoHtml,
  injectStartupTokensIntoRendererHtml,
  loadRenderer
} from './rendererLoader.js';

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

  const result = injectDevRendererIntoHtml(html, 'http://127.0.0.1:24600/', '--startup-document-bg:#1f211f;');

  expect(result).toContain('<base href="http://127.0.0.1:24600/">');
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).toContain('document.documentElement.dataset.resolvedBaseColor = "dark";');
  expect(result).toContain('src="http://127.0.0.1:24600/src/main.tsx"');
  expect(result).not.toContain('startupCss=');
  expect(result).not.toContain('@react-refresh');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
  expect(result).not.toContain('/*STARTUP_INJECTED_BOOT_SCRIPT*/');
});

it('can defer the dev renderer module entry until runtime services are ready', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body><script type="module" src="/src/main.tsx"></script></body></html>';

  const result = injectDevRendererIntoHtml(html, 'http://127.0.0.1:24600/', '--startup-document-bg:#1f211f;', {
    deferMainScript: true
  });

  expect(result).toContain('type="application/x-foliole-deferred-module"');
  expect(result).toContain('data-startup-src="http://127.0.0.1:24600/src/main.tsx"');
  expect(result).not.toContain('type="module" src="http://127.0.0.1:24600/src/main.tsx"');
});

it('activates a deferred renderer entry in the already loaded index document', async () => {
  const window = {
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(true)
    }
  };

  await activateDeferredRendererEntry(window as never);

  expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('__vite_plugin_react_preamble_installed__'),
    true
  );
});

it('injects startup tokens and a file base tag into packaged renderer html', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body></body></html>';

  const result = injectStartupTokensIntoRendererHtml(html, '/app/dist/index.html', '--startup-document-bg:#1f211f;');

  expect(result).toContain('<base href="file:///app/dist/">');
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).toContain('document.documentElement.dataset.resolvedBaseColor = "dark";');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
  expect(result).not.toContain('/*STARTUP_INJECTED_BOOT_SCRIPT*/');
});
