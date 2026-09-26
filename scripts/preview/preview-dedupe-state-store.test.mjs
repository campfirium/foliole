// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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

  it('keeps a newly created lock while its owner is still writing metadata', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-state-store-'));
    const lockFile = path.join(runtimeDir, 'windows-preview.state.lock');
    try {
      await writeFile(lockFile, '', 'utf8');
      const request = withStateLock({
        runtimeDir,
        target: 'windows',
        fn: () => ({ state: { runs: {} }, value: 'acquired' })
      });

      expect(await Promise.race([request, delay(150).then(() => 'waiting')])).toBe('waiting');
      await rm(lockFile);
      expect(await request).toBe('acquired');
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });
});
