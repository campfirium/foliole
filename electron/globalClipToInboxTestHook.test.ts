// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';

import { installGlobalClipToInboxTestHook } from './globalClipToInboxTestHook.js';

const originalEnvironment = {
  allowParallel: process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE,
  stateRoot: process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT
};

afterEach(() => {
  if (originalEnvironment.allowParallel === undefined) delete process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE;
  else process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE = originalEnvironment.allowParallel;
  if (originalEnvironment.stateRoot === undefined) delete process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
  else process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT = originalEnvironment.stateRoot;
  globalThis.__folioleRunGlobalClipToInboxForTests = undefined;
});

it('exposes global clip only inside an isolated desktop test runtime', () => {
  const run = vi.fn(async () => null);
  delete process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE;
  delete process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;

  installGlobalClipToInboxTestHook(run);
  expect(globalThis.__folioleRunGlobalClipToInboxForTests).toBeUndefined();

  process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE = '1';
  process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT = '/isolated/test-root';
  installGlobalClipToInboxTestHook(run);
  expect(globalThis.__folioleRunGlobalClipToInboxForTests).toBe(run);
});
