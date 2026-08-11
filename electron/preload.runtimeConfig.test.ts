import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload(env: Record<string, string | undefined>) {
  const exposeInMainWorld = vi.fn();
  const ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn()
  };
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier !== 'electron') {
      throw new Error(`unsupported require: ${specifier}`);
    }
    return {
      contextBridge: { exposeInMainWorld },
      ipcRenderer
    };
  });
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    __filename: PRELOAD_PATH,
    process: { env },
    require: sandboxRequire
  }, { filename: PRELOAD_PATH });
  return {
    api: exposeInMainWorld.mock.calls[0]?.[1],
    exposeInMainWorld,
    ipcRenderer,
    sandboxRequire
  };
}

describe('preload runtime config bridge', () => {
  it('exposes only supported guided sample locale overrides', () => {
    expect(executePreload({ FOLIOLE_GUIDED_SAMPLE_LOCALE: 'en-US' }).api.runtimeConfig).toEqual({
      guidedSampleLocale: 'en-US',
      systemLanguage: null
    });
    expect(executePreload({ FOLIOLE_GUIDED_SAMPLE_LOCALE: 'fr-FR' }).api.runtimeConfig).toEqual({
      guidedSampleLocale: null,
      systemLanguage: null
    });
  });

  it('exposes one sanitized host system language', () => {
    expect(executePreload({ FOLIOLE_SYSTEM_LANGUAGE: ' zh-Hans-CN ' }).api.runtimeConfig).toEqual({
      guidedSampleLocale: null,
      systemLanguage: 'zh-Hans-CN'
    });
    expect(executePreload({ FOLIOLE_SYSTEM_LANGUAGE: '   ' }).api.runtimeConfig.systemLanguage).toBeNull();
  });

  it('exposes the bridge from a sandbox-limited preload require environment', () => {
    const { api, exposeInMainWorld, sandboxRequire } = executePreload({});

    expect(sandboxRequire).toHaveBeenCalledWith('electron');
    expect(exposeInMainWorld).toHaveBeenCalledWith('electronAPI', api);
    expect(api).toEqual(expect.objectContaining({
      invoke: expect.any(Function),
      onReadwiseBookEpubProgress: expect.any(Function),
      runtimeConfig: expect.objectContaining({ systemLanguage: null })
    }));
  });

  it('drops malformed Readwise EPUB progress payloads at the preload boundary', () => {
    const { api, ipcRenderer } = executePreload({});
    const handler = vi.fn();
    api.onReadwiseBookEpubProgress(handler);
    const listener = ipcRenderer.on.mock.calls.find(([channel]) => channel === 'foliole:readwise-book-epub-progress')?.[1];

    listener({}, { detail: 42, nodeId: 'node-1', phase: 'importing_epub', progress: 0.5 });
    listener({}, { detail: 'Halfway', nodeId: 'node-1', phase: 'importing_epub', progress: Number.NaN });
    listener({}, { detail: 'Halfway', nodeId: 'node-1', phase: 'importing_epub', progress: 1.5 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      detail: 'Halfway',
      nodeId: 'node-1',
      phase: 'importing_epub',
      progress: 1
    });
  });
});
