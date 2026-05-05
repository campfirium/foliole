// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('./runtimeStartupTokens.js', () => ({
  getRuntimeStartupTokensInlineCss: () => '--startup-document-bg:#1f211f;'
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp'
  }
}));

import { injectStartupTokensIntoRendererHtml, loadRenderer } from './rendererLoader.js';

it('loads the renderer with startup error query parameters', async () => {
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
    expect(loadedUrl.searchParams.get('startupView')).toBe('startup-error');
    expect(loadedUrl.searchParams.get('startupModule')).toBe('Database migration');
    expect(loadedUrl.searchParams.get('startupError')).toBe('migration failed');
    expect(loadedUrl.searchParams.get('startupLogPath')).toBe('/logs');
  } finally {
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});

it('loads the workspace renderer without startup query state', async () => {
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
    await loadRenderer(window as never, process.cwd());

    const loadedUrl = new URL(window.loadURL.mock.calls[0]?.[0]);
    expect(loadedUrl.searchParams.get('startupCss')).toBe('--startup-document-bg:#1f211f;');
    expect(loadedUrl.searchParams.get('startupView')).toBeNull();
  } finally {
    if (originalUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalUrl;
    }
  }
});

it('injects startup tokens and a file base tag into packaged renderer html', () => {
  const html = '<html><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body></body></html>';

  const result = injectStartupTokensIntoRendererHtml(html, '/app/dist/index.html', '--startup-document-bg:#1f211f;');

  expect(result).toContain('<base href="file:///app/dist/">');
  expect(result).toContain(':root{--startup-document-bg:#1f211f;}');
  expect(result).not.toContain('/*STARTUP_INJECTED_CSS*/');
});
