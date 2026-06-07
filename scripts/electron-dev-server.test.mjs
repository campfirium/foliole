/* global AbortController */

import { describe, expect, it, vi } from 'vitest';

import {
  VITE_RENDERER_PREWARM_PATHS,
  isViteServerReady,
  prewarmViteRendererEntries,
  waitForPrewarmStartupBudget
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
    expect(VITE_RENDERER_PREWARM_PATHS).toContain('/src/app/App.tsx');
    expect(VITE_RENDERER_PREWARM_PATHS).toContain('/src/app/AppRuntime.tsx');
    expect(VITE_RENDERER_PREWARM_PATHS).toEqual(
      expect.arrayContaining([
        '/src/app/hooks/useAppController.ts',
        '/src/app/hooks/appControllerState.ts',
        '/src/app/hooks/appControllerLayoutProps.ts',
        '/src/app/components/WorkspaceLayout.tsx',
        '/src/app/components/WorkspaceLayoutGrid.tsx',
        '/src/store/workspaceStoreHydration.ts',
        '/src/store/workspaceRendererBoundaryKeepNodeIds.ts',
        '/src/shared/localization/locales/en.ts',
        '/src/shared/localization/locales/zhHans.ts'
      ])
    );
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

  it('passes an abort signal to prewarm fetches so slow diagnostic requests can be cancelled', async () => {
    const abortController = new AbortController();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));

    await prewarmViteRendererEntries('http://127.0.0.1:24600', fetchMock, {
      signal: abortController.signal
    });

    expect(fetchMock.mock.calls.every(([, options]) => options.signal === abortController.signal)).toBe(true);
  });
});

describe('waitForPrewarmStartupBudget', () => {
  it('reports prewarm completion before Electron launch when resources finish inside the budget', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const result = await waitForPrewarmStartupBudget(
      Promise.resolve([{ durationMs: 7, ok: true, path: '/src/main.tsx', status: 200 }]),
      { budgetMs: 50, logger, now: () => 10 }
    );

    expect(result.status).toBe('completed-before-launch');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info.mock.calls.some(([message]) => message.includes('prewarm_complete'))).toBe(true);
    expect(logger.info.mock.calls.some(([message]) => message.includes('prewarm_resource path=/src/main.tsx'))).toBe(true);
  });

  it('times out slow prewarm without hiding the eventual slow resource timings', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const abortController = new AbortController();
    let resolvePrewarm;
    const prewarmPromise = new Promise((resolve) => {
      resolvePrewarm = resolve;
    });

    const result = await waitForPrewarmStartupBudget(prewarmPromise, {
      abortController,
      budgetMs: 1,
      logger,
      now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(3).mockReturnValue(25)
    });

    expect(result).toEqual({ elapsedMs: 3, status: 'timeout-launch-electron' });
    expect(abortController.signal.aborted).toBe(true);
    expect(logger.warn.mock.calls.some(([message]) => message.includes('prewarm_timeout'))).toBe(true);
    expect(logger.warn.mock.calls.some(([message]) => message.includes('prewarm_abort'))).toBe(true);

    resolvePrewarm([{ durationMs: 24, ok: true, path: '/src/app/styles.css', status: 200 }]);
    await Promise.resolve();

    expect(logger.info.mock.calls.some(([message]) => message.includes('prewarm_complete'))).toBe(true);
    expect(logger.info.mock.calls.some(([message]) => message.includes('path=/src/app/styles.css durationMs=24'))).toBe(true);
  });
});
