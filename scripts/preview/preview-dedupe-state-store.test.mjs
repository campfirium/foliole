// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  actualRename: null,
  rename: vi.fn()
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  fsMock.actualRename = actual.rename;
  return { ...actual, rename: fsMock.rename };
});

const { withStateLock } = await import('./preview-dedupe-state-store.mjs');

describe('preview-dedupe state store', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient Windows state rename failures instead of failing the request', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-state-store-'));
    try {
      fsMock.rename
        .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EPERM' }))
        .mockImplementation((from, to) => fsMock.actualRename(from, to));

      const value = await withStateLock({
        runtimeDir,
        target: 'windows',
        fn: () => ({ state: { activeRunId: null, runs: { run: { status: 'pending' } } }, value: 'ok' })
      });
      const state = JSON.parse(await readFile(path.join(runtimeDir, 'windows-preview.state.json'), 'utf8'));

      expect(value).toBe('ok');
      expect(state.runs.run.status).toBe('pending');
      expect(fsMock.rename).toHaveBeenCalledTimes(2);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });
});
