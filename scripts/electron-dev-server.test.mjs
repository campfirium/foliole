import { describe, expect, it, vi } from 'vitest';

import {
  VITE_RENDERER_PREWARM_PATHS,
  isViteServerReady,
  prewarmViteRendererEntries
} from './electron-dev-server.mjs';

describe('isViteServerReady', () => {
  it('returns true when server responds with ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    await expect(isViteServerReady('http://127.0.0.1:4600', fetchMock)).resolves.toBe(true);
  });

  it('returns false when request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect failed'));
    await expect(isViteServerReady('http://127.0.0.1:4600', fetchMock)).resolves.toBe(false);
  });
});

describe('prewarmViteRendererEntries', () => {
  it('requests the desktop CSS and module entries before Electron opens the window', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));

    const results = await prewarmViteRendererEntries('http://127.0.0.1:24600', fetchMock);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      VITE_RENDERER_PREWARM_PATHS.map((path) => `http://127.0.0.1:24600${path}`)
    );
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('reports failed prewarm requests without hiding the target path', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/src/app/styles.css')) {
        return { ok: false, status: 500 };
      }
      throw new Error('missing module');
    });

    const results = await prewarmViteRendererEntries('http://127.0.0.1:24600/', fetchMock);

    expect(results.map((result) => result.path)).toEqual(VITE_RENDERER_PREWARM_PATHS);
    expect(results).toContainEqual(expect.objectContaining({ ok: false, path: '/src/app/styles.css', status: 500 }));
    expect(results).toContainEqual(expect.objectContaining({ error: 'missing module', ok: false, path: '/src/main.tsx' }));
  });

  it('retries a resource that is briefly unavailable while Vite warms modules', async () => {
    const attemptsByUrl = new Map();
    const fetchMock = vi.fn(async (url) => {
      const key = String(url);
      const attempts = attemptsByUrl.get(key) ?? 0;
      attemptsByUrl.set(key, attempts + 1);
      if (key.endsWith('/src/main.tsx') && attempts === 0) {
        throw new Error('module not transformed yet');
      }
      return { ok: true, status: 200 };
    });

    const results = await prewarmViteRendererEntries('http://127.0.0.1:24600', fetchMock);

    expect(results).toContainEqual(expect.objectContaining({ ok: true, path: '/src/main.tsx', status: 200 }));
    expect(attemptsByUrl.get('http://127.0.0.1:24600/src/main.tsx')).toBe(2);
  });
});
