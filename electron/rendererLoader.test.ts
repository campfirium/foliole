// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { loadRenderer } from './rendererLoader.js';

it('loads the renderer with startup error query parameters', async () => {
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
