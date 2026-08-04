// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { importWithGlobalClipToast } from './globalClipImportRunner.js';

function createToastController() {
  return { close: vi.fn(), update: vi.fn() };
}

it('shows a failure result when database readiness fails', async () => {
  const log = vi.fn();
  const run = vi.fn();
  const presentIssue = vi.fn(async () => true);
  const toast = createToastController();

  await expect(importWithGlobalClipToast({
    log,
    run,
    presentIssue,
    toast,
    waitForReady: vi.fn(async () => {
      throw new Error('database unavailable');
    })
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_database_not_ready', { error: expect.any(Error) });
  expect(run).not.toHaveBeenCalled();
  expect(toast.close).toHaveBeenCalledTimes(1);
  expect(presentIssue).toHaveBeenCalledWith('importFailed');
  expect(toast.update).not.toHaveBeenCalled();
});

it('logs import errors and shows a failure result', async () => {
  const log = vi.fn();
  const presentIssue = vi.fn(async () => true);
  const toast = createToastController();

  await expect(importWithGlobalClipToast({
    log,
    run: vi.fn(async () => {
      throw new Error('unsupported clipboard content');
    }),
    presentIssue,
    toast,
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_import_failed', { error: expect.any(Error) });
  expect(toast.close).toHaveBeenCalledTimes(1);
  expect(presentIssue).toHaveBeenCalledWith('importFailed');
  expect(toast.update).not.toHaveBeenCalled();
});

it('shows an empty result when changed clipboard content is not importable', async () => {
  const log = vi.fn();
  const presentIssue = vi.fn(async () => true);
  const toast = createToastController();

  await expect(importWithGlobalClipToast({
    log,
    run: vi.fn(async () => null),
    presentIssue,
    toast,
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_import_empty');
  expect(toast.close).toHaveBeenCalledTimes(1);
  expect(presentIssue).toHaveBeenCalledWith('empty');
  expect(toast.update).not.toHaveBeenCalled();
});
